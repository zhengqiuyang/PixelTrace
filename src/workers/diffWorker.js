/**
 * PixelTrace 差异计算 WebWorker
 * 复用 computeDiff + findDiffRegions，支持进度回报
 */

import { computeDiff, findDiffRegions } from '../utils/imageDiff.js';

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

    const regions = findDiffRegions(mask, w, h, {
      minArea: settings.minArea ?? 50,
      mergeDistance: settings.mergeDistance ?? 10,
      maxRegions: settings.maxRegions ?? 500,
    });

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
