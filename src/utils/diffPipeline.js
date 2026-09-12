/**
 * 单对差异计算管线 —— 单对视图与文件夹批量共用同一段计算序列。
 *
 * 抽出来的理由：这段序列（computeDiff → findDiffRegions → computeImageMetrics
 * → computeRegionMetrics）在两个 worker 里都要用。若各写一份，日后任何一处
 * 改了检测口径（比如新增一个 settings 项），另一处就会静默不同步，
 * 表现为「单对视图说 3 个区域，批量报告说 2 个」这种极难排查的问题。
 */

import { computeDiff, findDiffRegions } from './imageDiff.js';
import { computeImageMetrics, computeRegionMetrics } from './imageMetrics.js';

/**
 * 计算一对图像。
 *
 * @param {ImageData} dataA
 * @param {ImageData} dataB
 * @param {object} settings
 * @param {(percent:number)=>void} [settings.onProgress]
 * @returns {{diffImageData, diffCount, mask, regions, stats}}
 */
export function computePairResult(dataA, dataB, settings) {
  // 两图尺寸不同时，只在重叠区（左上角对齐的 min 尺寸）上计算，
  // 与单对视图的行为保持一致
  const w = Math.min(dataA.width, dataB.width);
  const h = Math.min(dataA.height, dataB.height);

  const { diffImageData, diffCount, mask, filtered } = computeDiff(dataA, dataB, {
    threshold: settings.threshold,
    mode: settings.diffMode,
    antiAlias: settings.antiAlias,
    ignoreShift: settings.ignoreShift,
    onProgress: settings.onProgress,
  });

  const foundRegions = findDiffRegions(mask, w, h, {
    minArea: settings.minArea ?? 50,
    mergeDistance: settings.mergeDistance ?? 10,
    maxRegions: settings.maxRegions ?? 500,
  });

  // 质量指标：一趟遍历出 MSE/PSNR/SSIM/直方图，再补逐区域色差
  const metrics = computeImageMetrics(dataA, dataB);
  const regions = computeRegionMetrics(dataA, dataB, mask, foundRegions);

  const totalPixels = w * h;

  return {
    diffImageData,
    diffCount,
    mask,
    regions,
    stats: {
      totalPixels,
      diffCount,
      diffPercentage: totalPixels > 0 ? (diffCount / totalPixels) * 100 : 0,
      regionCount: regions.length,
      filtered,
      metrics,
    },
  };
}
