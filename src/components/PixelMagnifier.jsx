import { useRef, useEffect, useState, useCallback } from 'react';

const GRID_SIZE = 9;
const CELL_SIZE = 16;

/**
 * 像素放大镜 — 鼠标悬停时显示 9×9 像素网格
 * 支持单图（闪烁模式）和双图（其他模式）竖排显示
 */
export default function PixelMagnifier({ imgs, mouseX, mouseY, containerRect, visible }) {
  const canvasRef = useRef(null);
  const [pixelData, setPixelData] = useState(null);

  const readPixels = useCallback(() => {
    if (!imgs || imgs.length === 0 || mouseX == null || mouseY == null || !containerRect) {
      setPixelData(null);
      return;
    }

    const img = imgs[0];
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    const stageContent = document.querySelector('.canvas-stage-content');
    let scale = 1, tx = 0, ty = 0;
    if (stageContent) {
      const style = window.getComputedStyle(stageContent);
      const transform = style.transform;
      if (transform && transform !== 'none') {
        const m = transform.match(/matrix\(([^)]+)\)/);
        if (m) {
          const v = m[1].split(',').map(Number);
          scale = v[0]; tx = v[4]; ty = v[5];
        }
      }
    }

    const stageRect = document.querySelector('.canvas-stage')?.getBoundingClientRect();
    if (!stageRect) return;

    const localX = mouseX - stageRect.left;
    const localY = mouseY - stageRect.top;
    const imgX = Math.floor((localX - tx) / scale);
    const imgY = Math.floor((localY - ty) / scale);

    if (imgX < 0 || imgX >= imgW || imgY < 0 || imgY >= imgH) {
      setPixelData(null);
      return;
    }

    const half = Math.floor(GRID_SIZE / 2);

    const readGrid = (image) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);

      const startX = Math.max(0, imgX - half);
      const startY = Math.max(0, imgY - half);
      const w = Math.min(GRID_SIZE, canvas.width - startX);
      const h = Math.min(GRID_SIZE, canvas.height - startY);

      const data = ctx.getImageData(startX, startY, w, h);
      const pixels = [];
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const idx = (y * w + x) * 4;
          if (idx + 3 < data.data.length) {
            pixels.push({
              r: data.data[idx],
              g: data.data[idx + 1],
              b: data.data[idx + 2],
            });
          } else {
            pixels.push({ r: 0, g: 0, b: 0 });
          }
        }
      }
      return pixels;
    };

    const grids = imgs.map(readGrid);
    const centerIdx = Math.floor(GRID_SIZE * GRID_SIZE / 2);

    setPixelData({
      grids,
      centerX: imgX,
      centerY: imgY,
      centerPixels: grids.map(g => g[centerIdx]),
    });
  }, [imgs, mouseX, mouseY, containerRect]);

  useEffect(() => {
    if (visible) readPixels();
  }, [visible, readPixels]);

  useEffect(() => {
    if (!canvasRef.current || !pixelData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const numGrids = pixelData.grids.length;
    const gridPx = GRID_SIZE * CELL_SIZE;
    const gap = 6;
    const labelH = 22;
    const pad = 8;
    const totalW = gridPx + pad * 2;
    const totalH = numGrids * (gridPx + labelH) + (numGrids - 1) * gap + pad * 2;

    canvas.width = totalW;
    canvas.height = totalH;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    pixelData.grids.forEach((grid, gi) => {
      const offsetY = pad + gi * (gridPx + labelH + gap);

      grid.forEach((px, i) => {
        const x = pad + (i % GRID_SIZE) * CELL_SIZE;
        const y = offsetY + Math.floor(i / GRID_SIZE) * CELL_SIZE;
        const isCenter = i === Math.floor(GRID_SIZE * GRID_SIZE / 2);

        ctx.fillStyle = `rgb(${px.r}, ${px.g}, ${px.b})`;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

        if (isCenter) {
          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
      });

      // 标签
      const labelY = offsetY + gridPx + 12;
      ctx.fillStyle = gi === 0 ? '#00ccff' : '#ff3366';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(gi === 0 ? '原始' : '修改后', pad + gridPx / 2, labelY);

      // 中心像素 RGB
      const cp = pixelData.centerPixels[gi];
      if (cp) {
        ctx.fillStyle = '#888';
        ctx.font = '9px monospace';
        ctx.fillText(`R:${cp.r} G:${cp.g} B:${cp.b}`, pad + gridPx / 2, labelY + 12);
      }
    });
  }, [pixelData]);

  if (!visible || !pixelData) return null;

  const gridPx = GRID_SIZE * CELL_SIZE;
  const pad = 8;

  return (
    <div
      style={{
        position: 'fixed',
        left: (containerRect?.left || 0) - gridPx - pad * 2 - 14,
        top: (containerRect?.top || 0) + 10,
        zIndex: 100,
        pointerEvents: 'none',
        background: '#0e0e14',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 6,
        padding: pad,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: '#666',
        textAlign: 'center',
        marginTop: 4,
        letterSpacing: 0.5,
      }}>
        ({pixelData.centerX}, {pixelData.centerY})
      </div>
    </div>
  );
}
