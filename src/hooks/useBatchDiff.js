import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 批量对比编排。
 *
 * 串行而不是并行：每张图解码后都要占一块 ImageData，4K 图单张就 33MB，
 * 并行几张很容易把内存打满。串行的代价只是总时长线性增长，
 * 而这个过程本来就有进度条兜着。
 *
 * 结果**增量发布**（每算完一张就更新一次 state），用户可以边算边看，
 * 不用等几十张全部跑完。
 *
 * 单边独有的文件（只在 A 有 / 只在 B 有）不算差异，但也会生成缩略图 ——
 * 回归场景里「这张图是新加的」和「这张图被删了」本身就是要确认的信息。
 */

const THUMB_MAX = 160;

function makeThumb(bitmap, canvas, ctx, maxDim = THUMB_MAX) {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function previewToDataUrl(preview, canvas, ctx) {
  // putImageData 要求 data 长度严格等于 w*h*4，worker 那边保证了这一点
  const img = new ImageData(preview.data, preview.width, preview.height);
  canvas.width = preview.width;
  canvas.height = preview.height;
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8);
}

const initialState = {
  running: false,
  done: 0,
  total: 0,
  current: '',
  currentPercent: 0,
  resultsByKey: new Map(),
  canceled: false,
  fatal: null,
};

export function useBatchDiff() {
  const [state, setState] = useState(initialState);

  const workerRef = useRef(null);
  const pendingRef = useRef(new Map());
  const cancelRef = useRef(false);
  const runIdRef = useRef(0);

  const disposeWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    pendingRef.current.clear();
  }, []);

  useEffect(() => disposeWorker, [disposeWorker]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    runIdRef.current += 1;
    disposeWorker();
    setState((s) => ({ ...s, running: false, canceled: true, currentPercent: 0 }));
  }, [disposeWorker]);

  const reset = useCallback(() => {
    cancelRef.current = true;
    runIdRef.current += 1;
    disposeWorker();
    cancelRef.current = false;
    setState(initialState);
  }, [disposeWorker]);

  /**
   * @param {object} pairing pairFolders() 的返回值
   * @param {object} settings 检测设置（threshold / minArea / diffMode ...）
   */
  const run = useCallback(async (pairing, settings) => {
    disposeWorker();
    cancelRef.current = false;
    const runId = ++runIdRef.current;

    const isStale = () => runId !== runIdRef.current || cancelRef.current;

    const pairs = pairing?.pairs ?? [];
    const onlyA = pairing?.onlyA ?? [];
    const onlyB = pairing?.onlyB ?? [];
    // 进度总量 = 要算的对数 + 要单独出缩略图的单边文件数
    const total = pairs.length + onlyA.length + onlyB.length;

    setState({ ...initialState, running: true, total, resultsByKey: new Map() });

    if (total === 0) {
      setState((s) => ({ ...s, running: false }));
      return;
    }

    let worker;
    try {
      worker = new Worker(
        new URL('../workers/batchWorker.js', import.meta.url),
        { type: 'module' }
      );
    } catch (err) {
      setState((s) => ({
        ...s,
        running: false,
        fatal: `无法创建 WebWorker：${err.message}`,
      }));
      return;
    }

    workerRef.current = worker;

    worker.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'pairProgress') {
        if (d.id === runIdRef.current) {
          setState((s) => (s.running ? { ...s, currentPercent: d.percent } : s));
        }
        return;
      }
      const pending = pendingRef.current.get(d.id);
      if (!pending) return;
      pendingRef.current.delete(d.id);
      if (d.type === 'pairResult') pending.resolve(d.result);
      else pending.reject(new Error(d.error?.message ?? '计算失败'));
    };

    worker.onerror = (e) => {
      // worker 整体挂了：把挂起的那一张置为失败，避免永久等待
      for (const [, p] of pendingRef.current) {
        p.reject(new Error(e.message || 'Worker 异常'));
      }
      pendingRef.current.clear();
    };

    // 复用的离屏画布，避免每张图都新建
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const resultsByKey = new Map();
    let done = 0;

    const publish = () => setState((s) => ({
      ...s,
      done,
      resultsByKey: new Map(resultsByKey),
    }));

    const postPair = (payload) => new Promise((resolve, reject) => {
      pendingRef.current.set(payload.id, { resolve, reject });
      worker.postMessage(payload, [payload.imageDataA.data.buffer, payload.imageDataB.data.buffer]);
    });

    // ── 1. 逐对计算 ──
    for (let i = 0; i < pairs.length; i++) {
      if (isStale()) break;

      const pair = pairs[i];
      setState((s) => ({ ...s, current: pair.relA, currentPercent: 0 }));

      let bmA = null;
      let bmB = null;

      try {
        bmA = await createImageBitmap(pair.fileA);
        bmB = await createImageBitmap(pair.fileB);
        if (isStale()) break;

        // 缩略图先做 —— 后面要把像素数据转移给 worker，转移后本线程就拿不到了
        const thumbA = makeThumb(bmA, canvas, ctx);
        const thumbB = makeThumb(bmB, canvas, ctx);

        const w = Math.min(bmA.width, bmB.width);
        const h = Math.min(bmA.height, bmB.height);
        if (w <= 0 || h <= 0) throw new Error('图片尺寸无效');

        // 与单对视图一致：按 min 尺寸缩放绘制后再取像素
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(bmA, 0, 0, w, h);
        const imageDataA = ctx.getImageData(0, 0, w, h);

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(bmB, 0, 0, w, h);
        const imageDataB = ctx.getImageData(0, 0, w, h);

        const result = await postPair({
          type: 'pair',
          id: runId,
          key: pair.key,
          imageDataA,
          imageDataB,
          // 原图尺寸要单独带上：上面两张 ImageData 都被画成了 min(w,h)，
          // worker 从它们身上读不出「两张图尺寸不同」
          sizeA: { width: bmA.width, height: bmA.height },
          sizeB: { width: bmB.width, height: bmB.height },
          settings,
        });

        if (isStale()) break;

        resultsByKey.set(pair.key, {
          ...result,
          thumbA,
          thumbB,
          thumbDiff: previewToDataUrl(result.preview, canvas, ctx),
        });
      } catch (err) {
        // 单张失败不该中断整批 —— 记下原因继续跑下一张
        resultsByKey.set(pair.key, { error: err.message || '计算失败' });
      } finally {
        bmA?.close?.();
        bmB?.close?.();
      }

      if (isStale()) break;
      done += 1;
      publish();
    }

    // ── 2. 单边独有文件：只出缩略图，不参与差异计算 ──
    const thumbOnly = async (entries, prefix, keyOf) => {
      for (let i = 0; i < entries.length; i++) {
        if (isStale()) return;
        const e = entries[i];
        setState((s) => ({ ...s, current: e.rel, currentPercent: 0 }));
        let bm = null;
        try {
          bm = await createImageBitmap(e.file);
          if (isStale()) return;
          resultsByKey.set(keyOf(e), { [prefix]: makeThumb(bm, canvas, ctx) });
        } catch (err) {
          resultsByKey.set(keyOf(e), { error: err.message || '无法读取' });
        } finally {
          bm?.close?.();
        }
        done += 1;
        publish();
      }
    };

    await thumbOnly(onlyA, 'thumbA', (e) => `A::${e.rel}`);
    await thumbOnly(onlyB, 'thumbB', (e) => `B::${e.rel}`);

    disposeWorker();

    setState((s) => ({
      ...s,
      running: false,
      done: Math.min(done, total),
      currentPercent: 0,
      resultsByKey: new Map(resultsByKey),
    }));
  }, [disposeWorker]);

  return { ...state, run, cancel, reset };
}
