/**
 * PixelTrace 图像差异核心算法
 * 纯函数实现，可脱离 UI 单独测试
 */

/**
 * 逐像素 RGB 差异计算
 * @param {ImageData} a - 图像 A
 * @param {ImageData} b - 图像 B
 * @param {Object} options
 * @param {number} options.threshold - 差异阈值 (0-100)
 * @returns {{ diffImageData: ImageData, diffCount: number, mask: Uint8Array }}
 */
export function computeDiff(a, b, { threshold = 30, onProgress } = {}) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const len = w * h;

  const diff = new Uint8ClampedArray(len * 4);
  const mask = new Uint8Array(len);
  let diffCount = 0;

  const reportInterval = Math.max(1, Math.floor(h / 100));

  for (let y = 0; y < h; y++) {
    const rowStart = y * w;
    for (let x = 0; x < w; x++) {
      const i = rowStart + x;
      const idx = i * 4;
      const dr = Math.abs(a.data[idx] - b.data[idx]);
      const dg = Math.abs(a.data[idx + 1] - b.data[idx + 1]);
      const db = Math.abs(a.data[idx + 2] - b.data[idx + 2]);
      const delta = (dr + dg + db) / 3;

      if (delta > threshold) {
        diff[idx] = dr * 3;
        diff[idx + 1] = dg * 3;
        diff[idx + 2] = db * 3;
        diff[idx + 3] = 255;
        mask[i] = 1;
        diffCount++;
      } else {
        diff[idx] = 0;
        diff[idx + 1] = 0;
        diff[idx + 2] = 0;
        diff[idx + 3] = 0;
        mask[i] = 0;
      }
    }

    if (onProgress && y % reportInterval === 0) {
      onProgress(Math.round((y / h) * 100));
    }
  }

  if (onProgress) onProgress(100);

  const diffImageData = new ImageData(diff, w, h);
  return { diffImageData, diffCount, mask };
}

/**
 * 逐像素相减（用于相减视图）
 * @param {ImageData} a - 图像 A
 * @param {ImageData} b - 图像 B
 * @param {number} [gain=3] - 放大倍数
 * @returns {ImageData}
 */
export function computeSubtract(a, b, gain = 3) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const len = w * h * 4;
  const result = new Uint8ClampedArray(len);

  for (let i = 0; i < len; i += 4) {
    result[i] = Math.min(255, Math.abs(a.data[i] - b.data[i]) * gain);
    result[i + 1] = Math.min(255, Math.abs(a.data[i + 1] - b.data[i + 1]) * gain);
    result[i + 2] = Math.min(255, Math.abs(a.data[i + 2] - b.data[i + 2]) * gain);
    result[i + 3] = 255;
  }

  return new ImageData(result, w, h);
}

/**
 * 区域聚类：连通域标记 + 合并 + 过滤
 * @param {Uint8Array} mask - 差异掩码 (0/1)
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {Object} options
 * @param {number} options.minArea - 最小区域面积
 * @param {number} options.mergeDistance - 合并距离
 * @param {number} options.maxRegions - 最大区域数
 * @returns {Array<{ id: number, x: number, y: number, width: number, height: number, pixels: number, center: { x: number, y: number }, percentage: number }>}
 */
export function findDiffRegions(mask, width, height, { minArea = 50, mergeDistance = 10, maxRegions = 500 } = {}) {
  const visited = new Uint8Array(width * height);
  const rawRegions = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx] || mask[idx] === 0) continue;

      const region = floodFill4(mask, visited, x, y, width, height);
      if (region.pixels >= minArea) {
        rawRegions.push(region);
      }
    }
  }

  if (rawRegions.length === 0) return [];

  // 合并距离内的区域
  let merged = rawRegions;
  if (mergeDistance > 0) {
    merged = mergeNearbyRegions(rawRegions, mergeDistance);
  }

  // 按从上到下、从左到右排序并编号
  merged.sort((a, b) => {
    if (a.minY !== b.minY) return a.minY - b.minY;
    return a.minX - b.minX;
  });

  const totalPixels = merged.reduce((sum, r) => sum + r.pixels, 0);

  const result = merged.slice(0, maxRegions).map((r, i) => ({
    id: i + 1,
    x: r.minX,
    y: r.minY,
    width: r.maxX - r.minX + 1,
    height: r.maxY - r.minY + 1,
    pixels: r.pixels,
    center: { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 },
    percentage: totalPixels > 0 ? (r.pixels / totalPixels) * 100 : 0,
  }));

  return result;
}

function floodFill4(mask, visited, startX, startY, width, height) {
  const stack = [[startX, startY]];
  let minX = startX, maxX = startX, minY = startY, maxY = startY;
  let pixels = 0;

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx] || mask[idx] === 0) continue;

    visited[idx] = 1;
    pixels++;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return { minX, maxX, minY, maxY, pixels };
}

function mergeNearbyRegions(regions, distance) {
  const merged = [];
  const used = new Set();

  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;
    let current = { ...regions[i] };
    used.add(i);

    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue;
      const r = regions[j];
      if (rectDistance(current, r) <= distance) {
        current = mergeRects(current, r);
        used.add(j);
      }
    }

    merged.push(current);
  }

  return merged;
}

function rectDistance(a, b) {
  const dx = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
  const dy = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
  return Math.sqrt(dx * dx + dy * dy);
}

function mergeRects(a, b) {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
    pixels: a.pixels + b.pixels,
  };
}

/**
 * 图片转灰度
 * @param {ImageData} src - 源 ImageData
 * @param {number} [dim=0.6] - 亮度降低系数
 * @returns {ImageData}
 */
export function toGrayscale(src, dim = 0.6) {
  const result = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const avg = (src.data[i] + src.data[i + 1] + src.data[i + 2]) / 3;
    result[i] = avg * dim;
    result[i + 1] = avg * dim;
    result[i + 2] = avg * dim;
    result[i + 3] = 255;
  }
  return new ImageData(result, src.width, src.height);
}

/**
 * 检测两张图片尺寸是否一致
 * @param {{ width: number, height: number }} a
 * @param {{ width: number, height: number }} b
 * @returns {{ sameSize: boolean, sizeDiffMessage: string | null }}
 */
export function detectSizeMismatch(a, b) {
  if (!a || !b) return { sameSize: true, sizeDiffMessage: null };
  if (a.width === b.width && a.height === b.height) {
    return { sameSize: true, sizeDiffMessage: null };
  }
  const wDiff = Math.abs(a.width - b.width);
  const hDiff = Math.abs(a.height - b.height);
  const msg = `图片尺寸不同: ${a.width}×${a.height} vs ${b.width}×${b.height} (差异: ${wDiff}×${hDiff}px)`;
  return { sameSize: false, sizeDiffMessage: msg };
}

/**
 * 将两张图片对齐到相同尺寸（居中填充黑色）
 * @param {ImageData} a
 * @param {ImageData} b
 * @param {{ mode: 'center' | 'top-left' | 'none' }} options
 * @returns {{ a: ImageData, b: ImageData, offsetX: number, offsetY: number }}
 */
export function alignImages(a, b, { mode = 'center' } = {}) {
  if (mode === 'none' || (a.width === b.width && a.height === b.height)) {
    return { a, b, offsetX: 0, offsetY: 0 };
  }

  const maxW = Math.max(a.width, b.width);
  const maxH = Math.max(a.height, b.height);

  const createPadded = (src, targetW, targetH) => {
    if (src.width === targetW && src.height === targetH) return src;
    const padded = new Uint8ClampedArray(targetW * targetH * 4);
    const offsetX = mode === 'center' ? Math.floor((targetW - src.width) / 2) : 0;
    const offsetY = mode === 'center' ? Math.floor((targetH - src.height) / 2) : 0;

    for (let y = 0; y < src.height; y++) {
      const srcRow = y * src.width * 4;
      const dstRow = (y + offsetY) * targetW * 4 + offsetX * 4;
      const rowBytes = src.width * 4;
      padded.set(src.data.subarray(srcRow, srcRow + rowBytes), dstRow);
    }

    return new ImageData(padded, targetW, targetH);
  };

  const aPadded = createPadded(a, maxW, maxH);
  const bPadded = createPadded(b, maxW, maxH);

  return {
    a: aPadded,
    b: bPadded,
    offsetX: mode === 'center' ? Math.floor((maxW - Math.min(a.width, b.width)) / 2) : 0,
    offsetY: mode === 'center' ? Math.floor((maxH - Math.min(a.height, b.height)) / 2) : 0,
  };
}
