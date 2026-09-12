/**
 * 图像质量指标 (PRODUCT.md §8.5 扩展)
 *
 * 「差异像素有多少」回答的是「哪里变了」，这个模块回答「改得有多狠」：
 *   MSE / PSNR  —— 全图能量型误差，业界最通用的质量指标
 *   SSIM        —— 结构相似度，比 PSNR 更接近人眼判断
 *   ΔE          —— 逐区域色差，量化「颜色偏了多少」
 *   RGB 直方图  —— 看整体偏色与曝光漂移
 *
 * 全部为纯函数，可脱离 UI 单独测试。
 */

/** SSIM 稳定常数，取自 Wang et al. 2004（K1=0.01, K2=0.03, L=255） */
const SSIM_C1 = (0.01 * 255) ** 2; // 6.5025
const SSIM_C2 = (0.03 * 255) ** 2; // 58.5225

/** 单个区域参与 ΔE 统计的像素上限，超出则等间隔抽样 */
const REGION_SAMPLE_CAP = 20000;

/** Rec.601 亮度，与 imageDiff 里的口径保持一致 */
function luma601(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ─── sRGB → CIE Lab ─────────────────────────────────────
// ΔE 必须在线性化的 Lab 空间里算，直接拿 sRGB 做欧氏距离是没有意义的
// （sRGB 经过 gamma 编码，数值距离与人眼感知不成比例）。

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** D65 白点下的 sRGB → XYZ → Lab */
export function rgbToLab(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);

  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;

  const Xn = 0.95047;
  const Yn = 1.0;
  const Zn = 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / Xn);
  const fy = f(Y / Yn);
  const fz = f(Z / Zn);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * CIE76 色差：Lab 空间里的欧氏距离。
 *
 * 用的是 CIE76 而不是 CIEDE2000 —— 后者对饱和色更准，但公式有几十行密集
 * 三角函数，在这个场景下性价比不高。CIE76 的已知弱点是在高饱和区偏大，
 * 所以 UI 上要标明是 ΔE76，不要让人误以为是 CIEDE2000 的读数。
 *
 * 参考量级：ΔE < 1 人眼基本看不出；1–2 需仔细看；> 5 一眼就能看出。
 */
export function deltaE76(lab1, lab2) {
  const dl = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

// ─── 全图指标 ───────────────────────────────────────────

/**
 * 一趟遍历同时算出 MSE / PSNR / SSIM / 直方图。
 *
 * SSIM 的口径说明（很重要，别把它当成标准 SSIM 实现）：
 *   标准 SSIM 用 11×11 高斯滑窗，逐像素滑动，代价是 O(n × 121)。
 *   这里用 **不重叠的 8×8 分块** 统计均值/方差/协方差再取平均 —— 同为 O(n)，
 *   数值上是有偏的（分块口径会略高于滑窗口径），但作为「改前改后差多少」的
 *   相对指标完全够用，且大图上快一个数量级。
 *   图像右侧/下侧不足一个完整块的边缘像素不参与统计。
 *
 * @param {ImageData} a
 * @param {ImageData} b
 * @param {{ blockSize?: number }} [options]
 * @returns {{ mse, psnr, ssim, ssimBlocks, histogram: { a: Uint32Array, b: Uint32Array } }}
 */
export function computeImageMetrics(a, b, { blockSize = 8 } = {}) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const ad = a.data;
  const bd = b.data;

  // 直方图：3 通道 × 256 bin
  const histA = new Uint32Array(768);
  const histB = new Uint32Array(768);

  let sqErrSum = 0;

  // SSIM 分块累加器
  const bw = Math.floor(w / blockSize);
  const bh = Math.floor(h / blockSize);
  const blockCount = bw * bh;
  const sumA = new Float64Array(blockCount);
  const sumB = new Float64Array(blockCount);
  const sumAA = new Float64Array(blockCount);
  const sumBB = new Float64Array(blockCount);
  const sumAB = new Float64Array(blockCount);

  for (let y = 0; y < h; y++) {
    const rowStart = y * w;
    const by = Math.floor(y / blockSize);
    const inBlockRow = by < bh;

    for (let x = 0; x < w; x++) {
      const idx = (rowStart + x) * 4;
      const r1 = ad[idx];
      const g1 = ad[idx + 1];
      const b1 = ad[idx + 2];
      const r2 = bd[idx];
      const g2 = bd[idx + 1];
      const b2 = bd[idx + 2];

      // MSE / PSNR：只算 RGB，忽略 alpha（与通行做法一致）
      const dr = r1 - r2;
      const dg = g1 - g2;
      const db = b1 - b2;
      sqErrSum += dr * dr + dg * dg + db * db;

      histA[r1]++;
      histA[256 + g1]++;
      histA[512 + b1]++;
      histB[r2]++;
      histB[256 + g2]++;
      histB[512 + b2]++;

      // SSIM 只累加完整分块；右/下侧不足一块的边缘像素直接跳过
      const bx = Math.floor(x / blockSize);
      if (inBlockRow && bx < bw) {
        const bi = by * bw + bx;
        const la = luma601(r1, g1, b1);
        const lb = luma601(r2, g2, b2);
        sumA[bi] += la;
        sumB[bi] += lb;
        sumAA[bi] += la * la;
        sumBB[bi] += lb * lb;
        sumAB[bi] += la * lb;
      }
    }
  }

  const totalChannels = w * h * 3;
  const mse = totalChannels > 0 ? sqErrSum / totalChannels : 0;
  // MSE 为 0 时 PSNR 是数学上的无穷大，用 Infinity 表示而不是硬塞一个上限值
  const psnr = mse > 0 ? 10 * Math.log10((255 * 255) / mse) : Infinity;

  let ssimSum = 0;
  let ssimBlocks = 0;
  const n = blockSize * blockSize;

  for (let i = 0; i < blockCount; i++) {
    const ma = sumA[i] / n;
    const mb = sumB[i] / n;
    const varA = sumAA[i] / n - ma * ma;
    const varB = sumBB[i] / n - mb * mb;
    const cov = sumAB[i] / n - ma * mb;

    // 方差理论上非负，但浮点累加可能给出 -1e-12，夹一下避免污染结果
    const va = varA > 0 ? varA : 0;
    const vb = varB > 0 ? varB : 0;

    ssimSum +=
      ((2 * ma * mb + SSIM_C1) * (2 * cov + SSIM_C2)) /
      ((ma * ma + mb * mb + SSIM_C1) * (va + vb + SSIM_C2));
    ssimBlocks++;
  }

  return {
    mse,
    psnr,
    ssim: ssimBlocks > 0 ? ssimSum / ssimBlocks : 1,
    ssimBlocks,
    histogram: { a: histA, b: histB },
  };
}

// ─── 逐区域指标 ─────────────────────────────────────────

/**
 * 给每个区域补上色差与亮度统计。
 *
 * ΔE 需要把每个像素转 Lab，涉及 pow 运算，比 diff 本身贵得多。
 * 因此单区域超过 REGION_SAMPLE_CAP 个像素时等间隔抽样，
 * 并把实际参与统计的样本数一并返回，UI 上可以如实标注。
 *
 * @param {ImageData} a
 * @param {ImageData} b
 * @param {Uint8Array} mask 差异掩码（长度 = w*h）
 * @param {Array} regions findDiffRegions 的输出
 * @returns {Array} 每个区域附加 metrics 字段的新数组
 */
export function computeRegionMetrics(a, b, mask, regions) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const ad = a.data;
  const bd = b.data;

  return regions.map((r) => {
    // 只在包围盒内找掩码为 1 的像素 —— 区域是连通的，这样比全图扫描省得多
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(w, r.x + r.width);
    const y1 = Math.min(h, r.y + r.height);

    const diffPixels = [];
    for (let y = y0; y < y1; y++) {
      const rowStart = y * w;
      for (let x = x0; x < x1; x++) {
        if (mask[rowStart + x]) diffPixels.push(rowStart + x);
      }
    }

    if (diffPixels.length === 0) {
      return { ...r, metrics: null };
    }

    const stride = Math.max(1, Math.ceil(diffPixels.length / REGION_SAMPLE_CAP));
    let sampled = 0;
    let sumDE = 0;
    let maxDE = 0;
    let sumLuma = 0;
    let sumAbsLuma = 0;

    for (let i = 0; i < diffPixels.length; i += stride) {
      const p = diffPixels[i] * 4;
      const lab1 = rgbToLab(ad[p], ad[p + 1], ad[p + 2]);
      const lab2 = rgbToLab(bd[p], bd[p + 1], bd[p + 2]);
      const de = deltaE76(lab1, lab2);

      sumDE += de;
      if (de > maxDE) maxDE = de;

      const la = luma601(ad[p], ad[p + 1], ad[p + 2]);
      const lb = luma601(bd[p], bd[p + 1], bd[p + 2]);
      sumLuma += lb - la;
      sumAbsLuma += Math.abs(lb - la);

      sampled++;
    }

    return {
      ...r,
      metrics: {
        meanDeltaE: sumDE / sampled,
        maxDeltaE: maxDE,
        // 带符号：正数表示该区域整体变亮，负数表示变暗
        meanLumaShift: sumLuma / sampled,
        meanAbsLumaShift: sumAbsLuma / sampled,
        sampled,
        total: diffPixels.length,
      },
    };
  });
}

// ─── 展示辅助 ───────────────────────────────────────────

/**
 * 把逐区域 ΔE 汇总成一对图的单一读数。
 *
 * 均值按区域像素数加权 —— 一个 3px 的小区域和一个 3600px 的大区域等权，
 * 会让整体均值被小区域里那几个极端像素带偏。
 *
 * 放在这里而不是 batchWorker 里：批量 worker 与单图报告都要用，
 * 两边各写一份的话同一个 diff 会在两个地方显示不同的 ΔE。
 */
export function summarizeDeltaE(regions) {
  if (!regions?.length) return { maxDeltaE: 0, meanDeltaE: 0 };
  let maxDeltaE = 0;
  let weighted = 0;
  let weight = 0;
  for (const r of regions) {
    const m = r.metrics;
    if (!m) continue;
    if (m.maxDeltaE > maxDeltaE) maxDeltaE = m.maxDeltaE;
    weighted += m.meanDeltaE * r.pixels;
    weight += r.pixels;
  }
  return { maxDeltaE, meanDeltaE: weight > 0 ? weighted / weight : 0 };
}

/** PSNR 是无穷大时不要显示成 "Infinity dB" */
export function formatPsnr(psnr) {
  if (!Number.isFinite(psnr)) return '∞ dB';
  return `${psnr.toFixed(2)} dB`;
}

/** SSIM 用 4 位小数才有区分度（0.99 和 0.999 差别很大） */
export function formatSsim(ssim) {
  return ssim.toFixed(4);
}

/**
 * 色差量级的人话解释，帮用户判断「这个数字算大吗」。
 *
 * 分档沿用通行的 ΔE 解释表：
 *   < 1   人眼基本无法分辨
 *   1–2   需仔细对比才能看出
 *   2–10  一眼就能看出
 *   11–49 仍属「比对立色更接近」，够不上「完全不同色」
 *   ≥ 50  接近两种毫不相干的颜色
 * 注意这是 ΔE76 的读数，在饱和色区会比 CIEDE2000 偏大。
 */
export function describeDeltaE(de) {
  if (de < 1) return '几乎看不出';
  if (de < 2) return '仔细看能发现';
  if (de < 10) return '一眼可见';
  if (de < 50) return '明显偏色';
  return '近乎两种颜色';
}
