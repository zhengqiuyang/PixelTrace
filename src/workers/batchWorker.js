/**
 * 批量差异计算 WebWorker
 *
 * 与单对 worker 的区别在于**返回什么**：
 * 单对视图要把完整 mask 与 diffImageData 交给画布渲染，所以必须传回全量数据；
 * 批量只关心「差了多少、有多严重、大概长什么样」，因此
 *   · 不返回完整 mask（4096² 的 mask 是 16MB，几十张来回搬运会拖垮内存）
 *   · 改为返回一张降采样后的差异预览图（长边 ≤ previewMax）
 *
 * 预览用「块内任一像素有差异就算差异」的采样口径 —— 用平均或中心点采样的话，
 * 细线条差异在降采样后会整条消失，报告里就会出现「有差异但预览一片灰」。
 */

import { computePairResult } from '../utils/diffPipeline.js';
import { hexToRgb } from '../utils/imageDiff.js';
import { summarizeDeltaE } from '../utils/imageMetrics.js';

/** 默认预览长边上限 */
const PREVIEW_MAX = 240;

/**
 * 生成差异预览：非差异区取原图 A 的灰度，差异区涂高亮色。
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function buildPreview(baseData, mask, w, h, highlightColor, maxDim) {
  const stride = Math.max(1, Math.ceil(Math.max(w, h) / maxDim));
  const pw = Math.max(1, Math.ceil(w / stride));
  const ph = Math.max(1, Math.ceil(h / stride));
  const out = new Uint8ClampedArray(pw * ph * 4);
  const [hr, hg, hb] = hexToRgb(highlightColor);

  for (let py = 0; py < ph; py++) {
    const y0 = py * stride;
    const y1 = Math.min(y0 + stride, h);
    for (let px = 0; px < pw; px++) {
      const x0 = px * stride;
      const x1 = Math.min(x0 + stride, w);

      let anyDiff = false;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let n = 0;

      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) {
          const i = row + x;
          if (mask[i]) anyDiff = true;
          const p = i * 4;
          rSum += baseData[p];
          gSum += baseData[p + 1];
          bSum += baseData[p + 2];
          n++;
        }
      }

      const o = (py * pw + px) * 4;
      if (anyDiff) {
        out[o] = hr;
        out[o + 1] = hg;
        out[o + 2] = hb;
        out[o + 3] = 255;
      } else {
        const gray = ((rSum / n) * 0.3 + (gSum / n) * 0.59 + (bSum / n) * 0.11) | 0;
        out[o] = gray;
        out[o + 1] = gray;
        out[o + 2] = gray;
        out[o + 3] = 255;
      }
    }
  }

  return { data: out, width: pw, height: ph };
}

self.onmessage = function (e) {
  const { type, id, key, imageDataA, imageDataB, settings, previewMax } = e.data;
  if (type !== 'pair') return;

  try {
    // 尺寸优先取调用方带来的原图尺寸。
    // 传进来的两张 ImageData 已经被统一画到重叠区（min 尺寸）了，
    // 从它们身上读宽高永远相等，「两张图尺寸不同」这件事会被抹掉。
    const sizeA = e.data.sizeA ?? { width: imageDataA.width, height: imageDataA.height };
    const sizeB = e.data.sizeB ?? { width: imageDataB.width, height: imageDataB.height };

    const { mask, regions, stats, diffCount } = computePairResult(imageDataA, imageDataB, {
      ...settings,
      onProgress: (percent) => {
        self.postMessage({ type: 'pairProgress', id, key, percent });
      },
    });

    const { maxDeltaE, meanDeltaE } = summarizeDeltaE(regions);
    const preview = buildPreview(
      imageDataA.data,
      mask,
      imageDataA.width,
      imageDataA.height,
      settings?.highlightColor,
      previewMax ?? PREVIEW_MAX
    );

    const m = stats.metrics ?? {};

    self.postMessage({
      type: 'pairResult',
      id,
      key,
      result: {
        // 差异是在重叠区（min 尺寸）上算出来的，报告里要说清这一点
        width: Math.min(sizeA.width, sizeB.width),
        height: Math.min(sizeA.height, sizeB.height),
        sizeA,
        sizeB,
        sizeMismatch: sizeA.width !== sizeB.width || sizeA.height !== sizeB.height,
        diffCount,
        diffPercentage: stats.diffPercentage,
        regionCount: stats.regionCount,
        maxDeltaE,
        meanDeltaE,
        mse: m.mse ?? null,
        psnr: m.psnr ?? null,
        ssim: m.ssim ?? null,
        preview,
      },
    });
  } catch (err) {
    self.postMessage({
      type: 'pairError',
      id,
      key,
      error: { message: err.message, stack: err.stack },
    });
  }
};
