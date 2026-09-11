/**
 * PixelTrace 差异计算 WebWorker
 * 复用 computeDiff + findDiffRegions，支持进度回报
 */

import { computeDiff, findDiffRegions } from '../utils/imageDiff.js';
import { computeImageMetrics, computeRegionMetrics } from '../utils/imageMetrics.js';

self.onmessage = function (e) {
  const { type, imageDataA, imageDataB, settings, id } = e.data;

  if (type !== 'compute') return;

  try {
    const w = Math.min(imageDataA.width, imageDataB.width);
    const h = Math.min(imageDataA.height, imageDataB.height);

    const { diffImageData, diffCount, mask, filtered } = computeDiff(imageDataA, imageDataB, {
      threshold: settings.threshold,
      mode: settings.diffMode,
      antiAlias: settings.antiAlias,
      ignoreShift: settings.ignoreShift,
      onProgress: (percent) => {
        self.postMessage({ type: 'progress', id, percent });
      },
    });

    const foundRegions = findDiffRegions(mask, w, h, {
      minArea: settings.minArea ?? 50,
      mergeDistance: settings.mergeDistance ?? 10,
      maxRegions: settings.maxRegions ?? 500,
    });

    // 质量指标：一趟遍历出 MSE/PSNR/SSIM/直方图，再补逐区域色差。
    // 放在 worker 里算，大图上不会卡住界面。
    const metrics = computeImageMetrics(imageDataA, imageDataB);
    const regions = computeRegionMetrics(imageDataA, imageDataB, mask, foundRegions);

    const totalPixels = w * h;
    const diffPercentage = totalPixels > 0 ? (diffCount / totalPixels) * 100 : 0;

    self.postMessage(
      {
        type: 'result',
        id,
        result: {
          diffImageData,
          diffCount,
          mask,
          regions,
          stats: {
            totalPixels,
            diffCount,
            diffPercentage,
            regionCount: regions.length,
            filtered,
            metrics,
          },
        },
      },
      [diffImageData.data.buffer, mask.buffer]
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      id,
      error: { message: err.message, stack: err.stack },
    });
  }
};
