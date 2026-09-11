/**
 * 画布坐标映射与像素取样 (PRODUCT.md §4.1 底部状态栏 / §7 放大镜)
 *
 * 视图中的图像统一通过 CSS transform: translate(tx, ty) scale(s) 呈现，
 * 因此「视口坐标 → 图像像素坐标」必须先扣除容器偏移，再做逆变换。
 * 这段逻辑原先散落在 PixelMagnifier 与 ComparisonView.updateSlider 里，
 * 这里收口成一份，供放大镜与状态栏共用，避免两处实现漂移。
 */

const STAGE_SELECTOR = '.canvas-stage';
const SPLIT_SELECTOR = '.split-view';
const CONTENT_SELECTOR = '.canvas-stage-content';

/** 解析 CSS matrix(a, b, c, d, tx, ty) */
function parseMatrix(transform) {
  if (!transform || transform === 'none') return { scale: 1, tx: 0, ty: 0 };
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return { scale: 1, tx: 0, ty: 0 };
  const v = m[1].split(',').map(Number);
  return { scale: v[0] || 1, tx: v[4] || 0, ty: v[5] || 0 };
}

/**
 * 定位当前视图的承载容器并解析其变换。
 * - CanvasStage 系视图（滑块/淡化/闪烁/相减/高亮）：.canvas-stage + .canvas-stage-content
 * - SplitView：.split-view，左右两半共用同一份 transform，
 *   落在右半区的点需要额外扣除容器一半宽度才是该面板内的局部坐标。
 */
function resolveStage() {
  const stage = document.querySelector(STAGE_SELECTOR);
  if (stage) {
    const content = document.querySelector(CONTENT_SELECTOR);
    const transform = content ? window.getComputedStyle(content).transform : null;
    return { el: stage, ...parseMatrix(transform), isSplit: false };
  }

  const split = document.querySelector(SPLIT_SELECTOR);
  if (!split) return null;
  // 两个面板使用完全相同的 inline transform，取第一个面板解析即可
  const panel = split.querySelector(':scope > div > div');
  const transform = panel ? window.getComputedStyle(panel).transform : null;
  return { el: split, ...parseMatrix(transform), isSplit: true };
}

/**
 * 视口坐标 → 图像像素坐标
 * 落在画布外（含负坐标）返回 null，由调用方决定回落展示。
 */
export function clientToImagePoint(clientX, clientY, imgW, imgH) {
  if (!imgW || !imgH) return null;
  const stage = resolveStage();
  if (!stage) return null;

  const rect = stage.el.getBoundingClientRect();
  let localX = clientX - rect.left;
  const localY = clientY - rect.top;
  if (stage.isSplit && localX >= rect.width / 2) {
    localX -= rect.width / 2;
  }

  const x = Math.floor((localX - stage.tx) / stage.scale);
  const y = Math.floor((localY - stage.ty) / stage.scale);
  if (x < 0 || y < 0 || x >= imgW || y >= imgH) return null;
  return { x, y };
}

/**
 * 取样画布缓存。
 * 状态栏与放大镜在每次 mousemove 都要读像素，若每次都新建全尺寸 canvas
 * 再 drawImage，在 4K 图上开销非常明显。这里按图片对象缓存，
 * 并用 FIFO 上限避免无限堆积（正常只有两张图，几乎不会触发淘汰）。
 */
const SAMPLER_CACHE_LIMIT = 4;
const samplers = new Map();

function getSampler(image) {
  if (!image) return null;
  const cached = samplers.get(image);
  if (cached) return cached;

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);

  if (samplers.size >= SAMPLER_CACHE_LIMIT) {
    samplers.delete(samplers.keys().next().value);
  }
  const sampler = { ctx, width, height };
  samplers.set(image, sampler);
  return sampler;
}

/** 读取单点 RGB，越界返回 null */
export function samplePixel(image, x, y) {
  const sampler = getSampler(image);
  if (!sampler) return null;
  if (x < 0 || y < 0 || x >= sampler.width || y >= sampler.height) return null;
  const d = sampler.ctx.getImageData(x, y, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2] };
}

/**
 * 读取以 (cx, cy) 为中心的 size×size 像素块，返回定长数组（行优先）。
 * 越界部分以黑色补齐，保证放大镜网格始终是 size×size。
 */
export function sampleGrid(image, cx, cy, size = 9) {
  const sampler = getSampler(image);
  if (!sampler) return null;

  const half = Math.floor(size / 2);
  const startX = Math.max(0, cx - half);
  const startY = Math.max(0, cy - half);
  const w = Math.min(size, sampler.width - startX);
  const h = Math.min(size, sampler.height - startY);
  if (w <= 0 || h <= 0) return null;

  const { data } = sampler.ctx.getImageData(startX, startY, w, h);

  const pixels = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (y < h && x < w) {
        const i = (y * w + x) * 4;
        pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
      } else {
        pixels.push({ r: 0, g: 0, b: 0 });
      }
    }
  }
  return pixels;
}

/** { r, g, b } → #RRGGBB */
export function toHex({ r, g, b }) {
  const part = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${part(r)}${part(g)}${part(b)}`;
}
