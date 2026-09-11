/**
 * 画布辅助叠加层 (PRODUCT.md §9.3 显示设置)
 *
 * 两种叠加物所在的空间不同，所以拆成两个组件：
 * - PixelGrid → 图像空间。放进 .canvas-stage-content / SplitView 面板里，
 *               跟着 transform 一起缩放，网格线天然落在图像像素边界上。
 * - Crosshair → 视口空间。放进 .view-canvas-wrapper 里，跟随鼠标位置。
 */

/**
 * 图像空间像素网格。
 *
 * step 是图像像素为单位的网格间距，lineWidth 是图像像素为单位的线宽 ——
 * 因为外层有 scale(zoom)，线宽必须传 1/zoom 才能在屏幕上稳定呈现 1px，
 * 否则缩小时线会被压成亚像素而消失。step 由调用方按「屏幕间距不小于 8px」
 * 选取，避免低倍率下糊成一片。
 */
export function PixelGrid({ step, lineWidth = 1 }) {
  if (!step || step <= 0) return null;
  const w = lineWidth > 0 ? lineWidth : 1;
  const color = 'rgba(0, 255, 136, 0.22)';
  return (
    <div
      className="pixel-grid"
      style={{
        backgroundImage:
          `linear-gradient(to right, ${color} ${w}px, transparent ${w}px),` +
          `linear-gradient(to bottom, ${color} ${w}px, transparent ${w}px)`,
        backgroundSize: `${step}px ${step}px`,
      }}
      aria-hidden="true"
    />
  );
}

/** 视口空间十字参考线；x / y 为相对容器的坐标，null 表示不显示 */
export function Crosshair({ x, y }) {
  if (x == null || y == null) return null;
  return (
    <div className="crosshair" aria-hidden="true">
      <div className="crosshair-v" style={{ left: `${x}px` }} />
      <div className="crosshair-h" style={{ top: `${y}px` }} />
    </div>
  );
}
