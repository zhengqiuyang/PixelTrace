import { useRef, useEffect } from 'react';

/**
 * RGB 直方图对比 (§8.5)
 *
 * 数据来自 imageMetrics.computeImageMetrics：每条通道 256 个 bin，
 * 数组布局是 [R(0..255), G(256..511), B(512..767)]。
 *
 * 展示口径：
 *   填充面 = 原始图 A，实线 = 修改后 B，两图共用同一纵轴刻度
 *   —— 共用刻度是重点，否则两条曲线各自归一化后看起来「形状一样」，
 *      而实际上整体亮度/曝光已经变了。
 *
 * 纵轴按峰值归一化。整图纯色的直方图会出现单根尖峰把其他 bin 压平，
 * 这是直方图的固有特性，不做平滑或截断 —— 宁可看起来极端也不要失真。
 */

const ROWS = [
  { label: 'R', offset: 0, color: '#ff5a5a' },
  { label: 'G', offset: 256, color: '#3ddc84' },
  { label: 'B', offset: 512, color: '#5aa9ff' },
];

const ROW_HEIGHT = 30;
const GAP = 6;
const LABEL_WIDTH = 14;

export default function HistogramChart({ histogram, width: widthProp }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !histogram?.a || !histogram?.b) return;

    // 侧栏宽度是可变的（窄屏会收窄），所以按父容器实测宽度绘制，
    // 而不是写死一个数字 —— 否则窄屏下画布会溢出或被压扁
    const measured = canvas.parentElement?.clientWidth;
    const width = widthProp ?? (measured && measured > 80 ? measured : 208);

    const dpr = window.devicePixelRatio || 1;
    const height = ROWS.length * ROW_HEIGHT + (ROWS.length - 1) * GAP;
    const plotWidth = width - LABEL_WIDTH;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ROWS.forEach((row, i) => {
      const top = i * (ROW_HEIGHT + GAP);
      const baseY = top + ROW_HEIGHT;

      // 两图共用峰值，保证「A 比 B 亮」这类整体差异看得出来
      let peak = 0;
      for (let bin = 0; bin < 256; bin++) {
        const va = histogram.a[row.offset + bin];
        const vb = histogram.b[row.offset + bin];
        if (va > peak) peak = va;
        if (vb > peak) peak = vb;
      }
      if (peak === 0) return;

      // 基线
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LABEL_WIDTH, baseY + 0.5);
      ctx.lineTo(width, baseY + 0.5);
      ctx.stroke();

      const xAt = (bin) => LABEL_WIDTH + (bin / 255) * plotWidth;
      const yAt = (count) => baseY - (count / peak) * (ROW_HEIGHT - 1);

      // A：填充面
      ctx.beginPath();
      ctx.moveTo(xAt(0), baseY);
      for (let bin = 0; bin < 256; bin++) {
        ctx.lineTo(xAt(bin), yAt(histogram.a[row.offset + bin]));
      }
      ctx.lineTo(xAt(255), baseY);
      ctx.closePath();
      ctx.fillStyle = `${row.color}38`;
      ctx.fill();

      // B：实线
      ctx.beginPath();
      for (let bin = 0; bin < 256; bin++) {
        const x = xAt(bin);
        const y = yAt(histogram.b[row.offset + bin]);
        if (bin === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 通道标签
      ctx.fillStyle = row.color;
      ctx.font = 'bold 9px monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(row.label, 0, top + 1);
    });
  }, [histogram, widthProp]);

  if (!histogram?.a || !histogram?.b) {
    return <p className="histogram-empty">暂无直方图数据</p>;
  }

  return (
    <div className="histogram">
      <canvas ref={canvasRef} className="histogram-canvas" aria-label="RGB 直方图对比" />
      <p className="histogram-legend">
        <span className="histogram-swatch histogram-swatch--fill" />
        原始
        <span className="histogram-swatch histogram-swatch--line" />
        修改后
        <span className="histogram-note">纵轴两图共用</span>
      </p>
    </div>
  );
}
