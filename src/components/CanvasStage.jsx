import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useZoomPan } from '../hooks/useZoomPan.js';

/**
 * CanvasStage — 统一画布容器
 * 所有比较视图渲染于此容器内，共享 zoom/pan 控制
 * 通过 CSS transform: translate() scale() 实现 60fps
 */
const CanvasStage = forwardRef(function CanvasStage(
  {
    contentWidth,
    contentHeight,
    children,
    onZoomPanChange,
    zoomStep,
    smoothZoom = true,
    showZoomPercent = true,
  },
  ref
) {
  const containerRef = useRef(null);
  const {
    zoom,
    pan,
    isPanning,
    isZooming,
    fitToWindow,
    setZoom,
    setPan,
    showZoomIndicator,
  } = useZoomPan(containerRef, contentWidth, contentHeight, { zoomStep, smoothZoom });

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    zoomToRegion: (region, containerWidth, containerHeight) => {
      // 计算缩放比：区域占视口 50%
      const scaleX = (containerWidth * 0.5) / region.width;
      const scaleY = (containerHeight * 0.5) / region.height;
      const targetZoom = Math.max(0.1, Math.min(16, Math.min(scaleX, scaleY)));

      // 计算平移：区域居中
      const targetPan = {
        x: containerWidth / 2 - region.center.x * targetZoom,
        y: containerHeight / 2 - region.center.y * targetZoom,
      };

      setZoom(targetZoom);
      setPan(targetPan);
    },
    fitToWindow,
    setZoom,
    setPan,
  }), [setZoom, setPan, fitToWindow]);

  // 初次挂载和尺寸变化时 fit
  const isFirstFit = useRef(true);
  useEffect(() => {
    if (isFirstFit.current && contentWidth > 0) {
      fitToWindow();
      isFirstFit.current = false;
    }
  }, [contentWidth, contentHeight, fitToWindow]);

  // 向上汇报 zoom/pan 变化
  useEffect(() => {
    if (onZoomPanChange) {
      onZoomPanChange({ zoom, pan, isPanning });
    }
  }, [zoom, pan, isPanning, onZoomPanChange]);

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
    width: contentWidth,
    height: contentHeight,
    position: 'absolute',
    top: 0,
    left: 0,
    willChange: 'transform',
  };

  return (
    <div
      ref={containerRef}
      className={`canvas-stage ${isZooming ? 'is-zooming' : ''}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: `
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px),
          #08080c
        `,
        backgroundSize: '20px 20px',
      }}
    >
      <div className="canvas-stage-content" style={transformStyle}>
        {children}
      </div>

      {showZoomPercent && showZoomIndicator && (
        <div className="zoom-indicator">
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  );
});

export default CanvasStage;
