import { useState, useEffect, useRef, useCallback } from 'react';
import { ERROR_MESSAGES } from '../utils/constants.js';
import { useToast } from './useToast.js';

let canvasIdCounter = 0;

function extractImageData(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

async function computeOnMain(dataA, dataB, settings, currentId, computeIdRef, cacheRef, setters) {
  const { computePairResult } = await import('../utils/diffPipeline.js');

  if (currentId !== computeIdRef.current) return;

  const result = computePairResult(dataA, dataB, settings);

  cacheRef.current = result;
  setters.setDiffImageData(result.diffImageData);
  setters.setMask(result.mask);
  setters.setRegions(result.regions);
  setters.setStats(result.stats);
  setters.setComputing(false);
  setters.setProgress(100);
}

function getImageId(img) {
  if (!img) return 'null';
  if (img.src) return img.src.slice(-80);
  // Canvas elements: use dimensions + incrementing id to avoid collision
  if (!img._diffId) img._diffId = `canvas:${img.width}x${img.height}:${++canvasIdCounter}`;
  return img._diffId;
}

export function useImageDiff(imgA, imgB, settings) {
  const [diffImageData, setDiffImageData] = useState(null);
  const [mask, setMask] = useState(null);
  const [regions, setRegions] = useState([]);
  const [stats, setStats] = useState(null);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState(0);

  const workerRef = useRef(null);
  const computeIdRef = useRef(0);
  const debounceTimerRef = useRef(null);
  const lastParamsRef = useRef('');
  const cacheRef = useRef(null);
  const { toast } = useToast();

  const settersRef = useRef({
    setDiffImageData,
    setMask,
    setRegions,
    setStats,
    setComputing,
    setProgress,
  });

  const cleanup = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!imgA || !imgB) {
      setDiffImageData(null);
      setMask(null);
      setRegions([]);
      setStats(null);
      setComputing(false);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      // 缓存 key 必须覆盖所有会影响计算结果的设置。
      // 漏掉任何一项，用户改了设置却拿回上一次的结果 —— 新增检测选项时务必同步这里。
      const paramsKey = [
        getImageId(imgA),
        getImageId(imgB),
        settings.threshold,
        settings.minArea,
        settings.mergeDistance,
        settings.diffMode,
        settings.antiAlias,
        settings.ignoreShift,
      ].join('|');

      if (paramsKey === lastParamsRef.current && cacheRef.current) {
        const cached = cacheRef.current;
        setDiffImageData(cached.diffImageData);
        setMask(cached.mask);
        setRegions(cached.regions);
        setStats(cached.stats);
        setComputing(false);
        setProgress(100);
        return;
      }

      lastParamsRef.current = paramsKey;
      setComputing(true);
      setProgress(0);

      const currentId = ++computeIdRef.current;

      const wA = imgA.naturalWidth || imgA.width;
      const hA = imgA.naturalHeight || imgA.height;
      const wB = imgB.naturalWidth || imgB.width;
      const hB = imgB.naturalHeight || imgB.height;
      const w = Math.min(wA, wB);
      const h = Math.min(hA, hB);

      // 延迟到下一帧执行，让 loading UI 先渲染
      requestAnimationFrame(() => {
        // 上传尺寸闸门取消后，超出浏览器 canvas 上限的图片会走到这里：
        // canvas 被浏览器压到 0×0，getImageData 越界抛 IndexSizeError。
        // 不拦的话异常会直接从 rAF 回调冒出去，整个比较视图停摆。
        let dataA;
        let dataB;
        try {
          dataA = extractImageData(imgA, w, h);
          dataB = extractImageData(imgB, w, h);
        } catch (err) {
          console.error('提取像素数据失败，图片可能超出浏览器 canvas 上限:', err);
          setComputing(false);
          setProgress(0);
          toast(ERROR_MESSAGES.OUT_OF_MEMORY.message, { type: 'error' });
          return;
        }

        if (settings.useWorker && typeof Worker !== 'undefined') {
          // 复用常驻 Worker，不每次新建
          if (!workerRef.current) {
            try {
              workerRef.current = new Worker(
                new URL('../workers/diffWorker.js', import.meta.url),
                { type: 'module' }
              );
            } catch {
              computeOnMain(dataA, dataB, settings, currentId, computeIdRef, cacheRef, settersRef.current);
              return;
            }
          }

          workerRef.current.onmessage = (e) => {
            if (e.data.id !== currentId) return;

            if (e.data.type === 'progress') {
              setProgress(e.data.percent);
            } else if (e.data.type === 'result') {
              const result = e.data.result;
              cacheRef.current = result;
              setDiffImageData(result.diffImageData);
              setMask(result.mask);
              setRegions(result.regions);
              setStats(result.stats);
              setComputing(false);
              setProgress(100);
            } else if (e.data.type === 'error') {
              console.error('Worker error, falling back:', e.data.error);
              workerRef.current.terminate();
              workerRef.current = null;
              const freshA = extractImageData(imgA, w, h);
              const freshB = extractImageData(imgB, w, h);
              computeOnMain(freshA, freshB, settings, currentId, computeIdRef, cacheRef, settersRef.current);
            }
          };

          workerRef.current.postMessage(
            {
              type: 'compute',
              id: currentId,
              imageDataA: dataA,
              imageDataB: dataB,
              settings,
            },
            [dataA.data.buffer, dataB.data.buffer]
          );
        } else {
          computeOnMain(dataA, dataB, settings, currentId, computeIdRef, cacheRef, settersRef.current);
        }
      });
    }, 150);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [imgA, imgB, settings, cleanup, toast]);

  useEffect(() => cleanup, [cleanup]);

  return {
    diffImageData,
    mask,
    regions,
    stats,
    computing,
    progress,
  };
}
