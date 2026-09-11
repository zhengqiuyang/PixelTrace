import { useRef, useEffect, useCallback } from 'react';
import { onDPRChange } from '../utils/canvasDPR.js';

export default function HighlightView({
  img1,
  img2,
  width,
  height,
  regions,
  mask,
  selectedRegion,
  hoveredRegion,
  onSelectRegion,
  displayMode,
  showDiffBoxes = true,
  showRegionNumbers = true,
  highlightColor = '#ff3366',
}) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img1 || !img2 || !width || !height) return;
    const ctx = canvas.getContext('2d');

    // ─── 1. 底图 ───
    if (displayMode === 'diff-only') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
    } else {
      // 叠加: 灰度底图
      const tmp = document.createElement('canvas');
      tmp.width = width;
      tmp.height = height;
      const tmpCtx = tmp.getContext('2d');
      tmpCtx.drawImage(img1, 0, 0, width, height);
      const imgData = tmpCtx.getImageData(0, 0, width, height);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const g = Math.round(imgData.data[i] * 0.3 + imgData.data[i+1] * 0.59 + imgData.data[i+2] * 0.11);
        imgData.data[i] = g; imgData.data[i+1] = g; imgData.data[i+2] = g;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // ─── 2. 差异像素 ───
    // 高亮色来自设置面板；选中/悬浮态仍用固定的荧光绿/电光蓝，
    // 因为这两个颜色承担的是「状态」语义，不该跟着主题色走
    if (mask && mask.length > 0) {
      ctx.fillStyle = highlightColor;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) {
          ctx.fillRect(i % width, Math.floor(i / width), 1, 1);
        }
      }
    }

    // ─── 3. 区域框 ───
    if (showDiffBoxes && regions && regions.length > 0) {
      regions.forEach((r) => {
        const isSelected = selectedRegion === r.id;
        const isHovered = hoveredRegion === r.id;
        const color = isSelected ? '#00ff88' : isHovered ? '#00ccff' : highlightColor;

        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 1.5;
        ctx.setLineDash(isSelected || isHovered ? [] : [6, 4]);
        ctx.strokeRect(r.x, r.y, r.width, r.height);

        if (!showRegionNumbers) return;

        const label = `#${r.id}`;
        ctx.font = 'bold 14px monospace';
        const tw = ctx.measureText(label).width;
        const ly = Math.max(16, r.y - 4);
        ctx.fillStyle = color;
        ctx.fillRect(r.x, ly - 14, tw + 8, 18);
        ctx.fillStyle = '#000';
        ctx.fillText(label, r.x + 4, ly);
      });
      ctx.setLineDash([]);
    }
  }, [
    img1, img2, width, height, regions, mask,
    selectedRegion, hoveredRegion, displayMode,
    showDiffBoxes, showRegionNumbers, highlightColor,
  ]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => onDPRChange(() => draw()), [draw]);

  const handleCanvasClick = useCallback((e) => {
    if (!regions || regions.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const hit = regions.find(
      (r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
    );
    if (hit) {
      onSelectRegion?.(selectedRegion === hit.id ? null : hit.id);
    }
  }, [regions, width, height, selectedRegion, onSelectRegion]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: `${width}px`, height: `${height}px`, cursor: 'crosshair', display: 'block' }}
      onClick={handleCanvasClick}
    />
  );
}
