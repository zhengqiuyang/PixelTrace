/**
 * PixelTrace 差异计算 WebWorker（单对）
 * 复用 computePairResult，支持进度回报
 */

import { computePairResult } from '../utils/diffPipeline.js';

self.onmessage = function (e) {
  const { type, imageDataA, imageDataB, settings, id } = e.data;

  if (type !== 'compute') return;

  try {
    const result = computePairResult(imageDataA, imageDataB, {
      ...settings,
      onProgress: (percent) => {
        self.postMessage({ type: 'progress', id, percent });
      },
    });

    self.postMessage(
      { type: 'result', id, result },
      [result.diffImageData.data.buffer, result.mask.buffer]
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      id,
      error: { message: err.message, stack: err.stack },
    });
  }
};
