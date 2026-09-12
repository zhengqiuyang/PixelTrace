/**
 * PixelTrace 图像差异核心算法
 * 纯函数实现，可脱离 UI 单独测试
 */

// ─── 差异度量 (§8.4) ────────────────────────────────────

/** 模式编码。热循环里比字符串快，也让分支更明确 */
export const DIFF_MODE = Object.freeze({ RGB: 'rgb', LUMA: 'luma', PERCEPTUAL: 'perceptual' });

/** Rec.601 亮度 */
function luma601(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * YIQ 空间的感知色差平方（pixelmatch 的度量）。
 *
 * 注意这里返回的是「平方」量纲：它由 y/i/q 三项平方和构成，
 * 直接拿它跟 0..100 的阈值比会完全对不上号。调用方要用
 * perceptualMagnitude() 换算成「等效亮度差」再比。
 */
function perceptualDeltaSq(r1, g1, b1, r2, g2, b2) {
  const y = 0.29889531 * (r1 - r2) + 0.58662247 * (g1 - g2) + 0.11448223 * (b1 - b2);
  const i = 0.59597799 * (r1 - r2) - 0.27417610 * (g1 - g2) - 0.32180189 * (b1 - b2);
  const q = 0.21147017 * (r1 - r2) - 0.52261711 * (g1 - g2) + 0.31114694 * (b1 - b2);
  return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
}

/**
 * 把 YIQ 色差平方换算成「等效亮度差」，量纲拉回 0..255。
 *
 * 目的是让三种模式的阈值能共用同一个 0..100 滑块：
 *   - 纯亮度变化时 i = q = 0，结果等于 |Δluma|，与 luma 模式一致；
 *   - 纯色彩变化时 i/q 贡献为正，结果大于亮度差 —— 这正是用 YIQ 的意义，
 *     饱和色块的变化会被放大，比单纯比 RGB 更接近人眼。
 *
 * 仅用于「展示」用途（比如报告里写等效亮度差）。
 * 判定差异时不要走这里 —— 开方既慢又会在阈值边界上引入浮点误差，
 * 热循环里直接比平方值（见 computeDiff 的 maxScore）。
 */
export function perceptualMagnitude(deltaSq) {
  return Math.sqrt(deltaSq / 0.5053);
}

/**
 * `#rrggbb` / `rrggbb` → [r, g, b]
 *
 * 放在这里是因为导出合成（exporters）与批量预览（batchWorker）都要用，
 * 而 batchWorker 是 worker 上下文，不宜去 import 导出模块。
 * 解析失败时回退到高亮默认色，而不是抛错 —— 高亮色来自用户设置，
 * 不该让一个非法色值把整次导出/批量计算打断。
 */
export function hexToRgb(hex, fallback = [255, 51, 102]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 感知口径的判据常量：把「等效亮度差阈值」换算到平方域。
 *
 * 换算关系是 maxScore = 0.5053 × threshold²，因为 YIQ 色差平方在
 * 纯亮度变化时恰好等于 0.5053 × Δluma²。
 *
 * 注意一个已知的边界效应：pixelmatch 那组 YIQ 系数之和是 1.00000001
 * 而不是精确的 1，所以纯灰度变化算出的 y 会比真实亮度差大一个 ULP。
 * 结果是「变化量恰好等于阈值」时，感知口径偶尔会比 rgb/luma 口径多判出
 * 一个像素。这是不同度量之间的量纲差异，不是 bug，也不值得为它把系数
 * 归一化（那会破坏与 pixelmatch 的可比性）。实践中阈值都是按观感调的。
 */
const PERCEPTUAL_K = 0.5053;

/** 取某像素的亮度 */
function pixelLuma(data, idx) {
  return luma601(data[idx], data[idx + 1], data[idx + 2]);
}

/**
 * 抗锯齿像素识别（pixelmatch 的思路）。
 *
 * 原理：抗锯齿边缘像素是「前景色与背景色的混合」，因此它在两个方向上都
 * 应该能找到更暗和更亮的同类像素。反过来，一个真正被改动的像素在 3×3
 * 邻域里找不到这种「明暗两侧都有」的结构。
 *
 * 相比 pixelmatch 原版，这里多了一道 minSpread 约束，原因是实测踩到的坑：
 * 当「大块纯色改动」压在「平滑渐变」底图上时，A 的邻域是渐变，明暗两侧
 * 只差 ±1 个灰阶（非零，所以躲得过 min === 0 的判断），而 B 的邻域因为
 * 是大色块而「同色邻居很多」，两个条件一凑就命中 —— 结果实心色块内部被
 * 掏出一片空洞（实测 3600px 的色块只剩 2253px）。
 * 抗锯齿的本质是像素夹在两个「确实不同」的颜色之间，渐变的 ±1 抖动不是边缘，
 * 因此这里要求两侧跨度都达到阈值量级才算数。
 *
 * @param {number} minSpread 两侧明暗跨度各自至少要达到的值（与原图亮度同量纲）
 * @returns {boolean} true 表示该像素是抗锯齿产物，应被忽略
 */
function isAntialiased(aData, bData, x1, y1, width, height, minSpread) {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = (y1 * width + x1) * 4;

  // 位于图像边界时少一个方向的邻居，先补 1 避免被误判成"邻域单调"
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0;
  let max = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;

      // 同一张图内、中心像素与邻居的亮度差（只看亮度，故用 y 分量）
      const delta =
        pixelLuma(aData, pos) - pixelLuma(aData, (y * width + x) * 4);

      if (delta === 0) {
        zeroes++;
        // 3 个以上完全相同的邻居 → 这是实心区域内部，不可能是抗锯齿
        if (zeroes > 2) return false;
      } else if (delta < min) {
        min = delta;
        minX = x;
        minY = y;
      } else if (delta > max) {
        max = delta;
        maxX = x;
        maxY = y;
      }
    }
  }

  // 邻域里没有同时出现更暗和更亮的像素 → 不是边缘
  if (min === 0 || max === 0) return false;

  // 两侧跨度都必须达到 minSpread。
  // -min 是最亮邻居的跨度，max 是最暗邻居的跨度（见上面的符号约定）。
  // 缺了这条，平滑渐变底图上的实心色块内部会被整片误判成抗锯齿。
  if (-min < minSpread || max < minSpread) return false;

  // 最暗或最亮的那个邻居，在两张图里都得是「实心」的，
  // 才说明中心像素夹在两个实心色块之间 —— 即典型的抗锯齿过渡
  return (
    (hasManySiblings(aData, minX, minY, width, height) &&
      hasManySiblings(bData, minX, minY, width, height)) ||
    (hasManySiblings(aData, maxX, maxY, width, height) &&
      hasManySiblings(bData, maxX, maxY, width, height))
  );
}

/** 3×3 邻域内是否存在 3 个以上与中心同色的像素 */
function hasManySiblings(data, x1, y1, width, height) {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = (y1 * width + x1) * 4;

  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      const p = (y * width + x) * 4;
      if (
        data[pos] === data[p] &&
        data[pos + 1] === data[p + 1] &&
        data[pos + 2] === data[p + 2] &&
        data[pos + 3] === data[p + 3]
      ) {
        zeroes++;
        if (zeroes > 2) return true;
      }
    }
  }
  return false;
}

/**
 * 逐像素差异计算
 *
 * 三种比较口径共用同一个 0..100 阈值滑块（换算见 perceptualMagnitude）：
 *   rgb        —— |ΔR|、|ΔG|、|ΔB| 的均值。默认，也是历史行为
 *   luma       —— 按 Rec.601 加权的亮度差，对色相不敏感、对明暗敏感
 *   perceptual —— YIQ 感知色差，饱和色变化被放大，更接近人眼判断
 *
 * @param {ImageData} a - 图像 A
 * @param {ImageData} b - 图像 B
 * @param {Object} options
 * @param {number} options.threshold - 差异阈值 (0-100)
 * @param {'rgb'|'luma'|'perceptual'} [options.mode='rgb'] - 比较口径
 * @param {boolean} [options.antiAlias=false] - 是否忽略抗锯齿像素（仅 perceptual 生效）
 * @param {number} [options.ignoreShift=0] - 容许的像素位移 0/1，用于吸收整体亚像素抖动
 * @returns {{ diffImageData: ImageData, diffCount: number, mask: Uint8Array,
 *             filtered: { shift: number, antiAlias: number } }}
 */
export function computeDiff(
  a,
  b,
  { threshold = 30, mode = DIFF_MODE.RGB, antiAlias = false, ignoreShift = 0, onProgress } = {}
) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const len = w * h;

  const diff = new Uint8ClampedArray(len * 4);
  const mask = new Uint8Array(len);
  let diffCount = 0;
  // 被忽略策略救回来的像素数，用来告诉用户"过滤掉了多少误报"
  let filteredByShift = 0;
  let filteredByAntiAlias = 0;

  const modeCode = mode === DIFF_MODE.LUMA ? 1 : mode === DIFF_MODE.PERCEPTUAL ? 2 : 0;
  const ad = a.data;
  const bd = b.data;
  const reportInterval = Math.max(1, Math.floor(h / 100));

  // 判据统一成 score > maxScore。
  // rgb / luma 直接比原值；perceptual 比平方值，省掉每像素一次开方
  // （4096² 就是 1600 万次 sqrt）。
  const maxScore = modeCode === 2 ? PERCEPTUAL_K * threshold * threshold : threshold;

  /** 按当前口径算两个像素的差异得分。perceptual 口径下是平方域，其余是原值域 */
  const scoreAt = (ia, ib) => {
    if (modeCode === 0) {
      const dr = Math.abs(ad[ia] - bd[ib]);
      const dg = Math.abs(ad[ia + 1] - bd[ib + 1]);
      const db = Math.abs(ad[ia + 2] - bd[ib + 2]);
      return (dr + dg + db) / 3;
    }
    if (modeCode === 1) {
      return Math.abs(pixelLuma(ad, ia) - pixelLuma(bd, ib));
    }
    return perceptualDeltaSq(ad[ia], ad[ia + 1], ad[ia + 2], bd[ib], bd[ib + 1], bd[ib + 2]);
  };

  for (let y = 0; y < h; y++) {
    const rowStart = y * w;
    for (let x = 0; x < w; x++) {
      const i = rowStart + x;
      const idx = i * 4;

      let isDiff = scoreAt(idx, idx) > maxScore;

      // 亚像素抖动：A 的这个像素在 B 的邻域里可能只是被平移了 1px，
      // 若邻域中存在更接近的像素，就认为它没变。
      if (isDiff && ignoreShift > 0) {
        const x0 = Math.max(x - ignoreShift, 0);
        const x1 = Math.min(x + ignoreShift, w - 1);
        const y0 = Math.max(y - ignoreShift, 0);
        const y1 = Math.min(y + ignoreShift, h - 1);

        for (let ny = y0; ny <= y1 && isDiff; ny++) {
          for (let nx = x0; nx <= x1; nx++) {
            if (nx === x && ny === y) continue;
            if (scoreAt(idx, (ny * w + nx) * 4) <= maxScore) {
              isDiff = false;
              filteredByShift++;
              break;
            }
          }
        }
      }

      // 抗锯齿：只在感知口径下开，因为它是为感知色差配套设计的
      // minSpread 直接取阈值：两侧色差连阈值都不到，本来也构不成视觉上的边缘
      if (isDiff && antiAlias && modeCode === 2 && isAntialiased(ad, bd, x, y, w, h, threshold)) {
        isDiff = false;
        filteredByAntiAlias++;
      }

      if (isDiff) {
        diff[idx] = Math.abs(ad[idx] - bd[idx]) * 3;
        diff[idx + 1] = Math.abs(ad[idx + 1] - bd[idx + 1]) * 3;
        diff[idx + 2] = Math.abs(ad[idx + 2] - bd[idx + 2]) * 3;
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
  return {
    diffImageData,
    diffCount,
    mask,
    filtered: { shift: filteredByShift, antiAlias: filteredByAntiAlias },
  };
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
