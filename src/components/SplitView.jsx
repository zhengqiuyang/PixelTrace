import { useRef, useEffect, useCallback, useState } from 'react';
import { setupCanvasDPR, onDPRChange } from '../utils/canvasDPR.js';

export default function SplitView({ img1, img2, width, height }) {
  const containerRef = useRef(null);
  const leftCanvasRef = useRef(null);
  const rightCanvasRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // 自定义 fit：每张图居中在自己的半宽面板里
  const fitToHalfPanel = useCallback(() => {
    const container = containerRef.current;
    if (!container || !width || !height) return;
    const rect = container.getBoundingClientRect();
    const panelW = rect.width / 2;
    const panelH = rect.height;
    const ratio = Math.min(panelW / width, panelH / height, 1);
    const scaledW = width * ratio;
    const scaledH = height * ratio;
    setZoom(ratio);
    setPan({
      x: (panelW - scaledW) / 2,
      y: (panelH - scaledH) / 2,
    });
  }, [width, height]);

  // 首次挂载 fit
  useEffect(() => {
    if (width > 0) fitToHalfPanel();
  }, [width, height, fitToHalfPanel]);

  // ResizeObserver 重新 fit
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => fitToHalfPanel());
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitToHalfPanel]);

  // 滚轮缩放（以鼠标为锚点）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setZoom((z) => {
        const newZ = Math.max(0.05, Math.min(16, z * delta));
        const scale = newZ / z;
        setPan((p) => ({
          x: mouseX - (mouseX - p.x) * scale,
          y: mouseY - (mouseY - p.y) * scale,
        }));
        return newZ;
      });
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // 拖拽平移
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    isPanningRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    };
    const handleMouseUp = () => { isPanningRef.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const drawLeft = useCallback(() => {
    if (!leftCanvasRef.current || !img1 || !width || !height) return;
    const ctx = setupCanvasDPR(leftCanvasRef.current, width, height);
    ctx.drawImage(img1, 0, 0, width, height);
  }, [img1, width, height]);

  const drawRight = useCallback(() => {
    if (!rightCanvasRef.current || !img2 || !width || !height) return;
    const ctx = setupCanvasDPR(rightCanvasRef.current, width, height);
    ctx.drawImage(img2, 0, 0, width, height);
  }, [img2, width, height]);

  useEffect(() => { drawLeft(); drawRight(); }, [drawLeft, drawRight, zoom, pan]);
  useEffect(() => onDPRChange(() => { drawLeft(); drawRight(); }), [drawLeft, drawRight]);

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <div
      ref={containerRef}
      className="split-view"
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', cursor: 'grab' }}
      onMouseDown={handleMouseDown}
    >
      {/* 左半：原始图 */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: '100%', overflow: 'hidden' }}>
        <div style={{
          transform, transformOrigin: '0 0',
          width, height,
          position: 'absolute', top: 0, left: 0,
          willChange: 'transform',
        }}>
          <canvas ref={leftCanvasRef} style={{ width: `${width}px`, height: `${height}px` }} />
        </div>
      </div>

      {/* 分割线 — 固定在视口中心 */}
      <div style={{
        position: 'absolute', left: '50%', top: 0,
        width: 2, height: '100%',
        background: 'var(--accent)',
        boxShadow: '0 0 10px rgba(0, 255, 136, 0.3), 0 0 30px rgba(0, 255, 136, 0.1)',
        zIndex: 10,
        pointerEvents: 'none', transform: 'translateX(-1px)',
      }} />

      {/* 右半：修改后图 */}
      <div style={{ position: 'absolute', top: 0, left: '50%', width: '50%', height: '100%', overflow: 'hidden' }}>
        <div style={{
          transform, transformOrigin: '0 0',
          width, height,
          position: 'absolute', top: 0, left: 0,
          willChange: 'transform',
        }}>
          <canvas ref={rightCanvasRef} style={{ width: `${width}px`, height: `${height}px` }} />
        </div>
      </div>

      <div className="zoom-indicator">{Math.round(zoom * 100)}%</div>
    </div>
  );
}
