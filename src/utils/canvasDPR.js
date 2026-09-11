/**
 * Canvas DPR 感知工具
 * 解决 Retina 屏幕下 Canvas 绘制模糊问题
 */

/**
 * 获取当前设备像素比
 * @returns {number}
 */
export function getDPR() {
  return window.devicePixelRatio || 1;
}

/**
 * 设置 Canvas 的物理分辨率，使其在高 DPR 屏幕下清晰
 * @param {HTMLCanvasElement} canvas
 * @param {number} cssWidth - CSS 宽度（逻辑像素）
 * @param {number} cssHeight - CSS 高度（逻辑像素）
 * @returns {CanvasRenderingContext2D}
 */
export function setupCanvasDPR(canvas, cssWidth, cssHeight) {
  const dpr = getDPR();
  const physW = Math.round(cssWidth * dpr);

  canvas.width = physW;
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  return ctx;
}

/**
 * 监听 DPR 变化并触发重绘
 * 用于跨屏拖动窗口时自动刷新
 * @param {Function} callback - DPR 变化时的回调
 * @returns {Function} 清理函数
 */
export function onDPRChange(callback) {
  let innerCleanup = null;
  const mql = window.matchMedia(`(resolution: ${getDPR()}dppx)`);
  const handler = (e) => {
    if (e.matches) {
      callback(getDPR());
      // 重新监听新的 DPR，链式保存 cleanup
      innerCleanup = onDPRChange(callback);
    }
  };

  mql.addEventListener('change', handler, { once: true });
  return () => {
    mql.removeEventListener('change', handler);
    if (innerCleanup) innerCleanup();
  };
}
