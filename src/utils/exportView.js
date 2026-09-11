/**
 * 把当前比较视图「所见即所得」地合成到一张离屏 canvas。
 *
 * 背景：各视图把图像绘制在一个或多个 <canvas> 上，再由 CanvasStage 通过
 * CSS transform: translate() scale() 做缩放平移（分割视图不套这一层）。
 * 因此不能只取第一个 canvas —— 那样在滑块/分割等多画布视图下会导出错误内容。
 *
 * 做法：
 *   1. 以视图容器的可视区为输出尺寸（× devicePixelRatio）
 *   2. 遍历容器内所有 canvas，用 getBoundingClientRect 取其在屏幕上的实际位置
 *      （该矩形已包含祖先的 CSS 变换，无需自己解析矩阵）
 *   3. 按 DOM 顺序绘制，并叠加祖先容器的 overflow 裁剪区域
 *      —— 滑块视图的左右分割、分割视图的左右两半都依赖 overflow:hidden 实现，
 *         不还原裁剪就会把整张图盖上去
 *
 * 已知取舍：分割线、标签、缩放百分比等 DOM 叠层不是 canvas，不会被包含。
 *
 * @returns {HTMLCanvasElement|null} 合成后的画布；无可导出内容时返回 null
 */

const BG_COLOR = '#08080c';

function isClippingElement(el) {
  const cs = window.getComputedStyle(el);
  return [cs.overflow, cs.overflowX, cs.overflowY].some((v) => v && v !== 'visible');
}

/**
 * 求元素被祖先 overflow 裁剪后的可见矩形（屏幕坐标）
 * @returns {{left,top,width,height}|null} 完全被裁掉时返回 null
 */
function clippedRect(el, stopAt) {
  const base = el.getBoundingClientRect();
  let rect = { left: base.left, top: base.top, width: base.width, height: base.height };

  let node = el.parentElement;
  while (node) {
    if (isClippingElement(node)) {
      const r = node.getBoundingClientRect();
      const left = Math.max(rect.left, r.left);
      const top = Math.max(rect.top, r.top);
      const right = Math.min(rect.left + rect.width, r.right);
      const bottom = Math.min(rect.top + rect.height, r.bottom);
      if (right <= left || bottom <= top) return null;
      rect = { left, top, width: right - left, height: bottom - top };
    }
    if (node === stopAt) break;
    node = node.parentElement;
  }

  return rect;
}

/**
 * @param {string|Element} target 视图容器选择器或元素本身（默认 .view-canvas-wrapper）
 * @returns {HTMLCanvasElement|null} 合成后的画布；无可导出内容时返回 null
 */
export function composeCurrentView(target = '.view-canvas-wrapper') {
  const wrapper = typeof target === 'string' ? document.querySelector(target) : target;
  if (!wrapper) return null;

  const canvases = Array.from(wrapper.querySelectorAll('canvas'));
  if (canvases.length === 0) return null;

  const viewRect = wrapper.getBoundingClientRect();
  const outW = Math.max(1, Math.round(viewRect.width));
  const outH = Math.max(1, Math.round(viewRect.height));
  const dpr = window.devicePixelRatio || 1;

  const out = document.createElement('canvas');
  out.width = Math.round(outW * dpr);
  out.height = Math.round(outH * dpr);

  const ctx = out.getContext('2d');
  if (!ctx) return null;

  ctx.scale(dpr, dpr);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, outW, outH);

  for (const canvas of canvases) {
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;

    const clip = clippedRect(canvas, wrapper);
    if (!clip) continue;

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      clip.left - viewRect.left,
      clip.top - viewRect.top,
      clip.width,
      clip.height
    );
    ctx.clip();

    try {
      ctx.drawImage(canvas, r.left - viewRect.left, r.top - viewRect.top, r.width, r.height);
    } catch {
      // 画布尚未初始化或不可读，跳过这一层
    }

    ctx.restore();
  }

  return out;
}

/** 生成 §10.1 规定的导出文件名：pixeltrace_{view}_{timestamp}.png（本地时间） */
export function buildExportFilename(view, ext = 'png') {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
    + `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `pixeltrace_${view}_${ts}.${ext}`;
}

/** 触发浏览器下载 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
