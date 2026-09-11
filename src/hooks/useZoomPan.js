import { useState, useRef, useEffect, useCallback } from 'react';
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, ZOOM_ANIMATION_DURATION } from '../utils/constants.js';

function clampZoom(z) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/**
 * 缩放与平移 Hook
 * @param {React.RefObject} containerRef - 画布容器 ref
 * @param {number} contentWidth - 内容宽度
 * @param {number} contentHeight - 内容高度
 * @param {{ zoomStep?: number, smoothZoom?: boolean }} [options]
 *   zoomStep 为每次滚轮的步进（0.01 ~ 0.5），smoothZoom 控制是否给 transform 加过渡
 * @returns {{ zoom, pan, isPanning, isZooming, zoomAtPoint, setZoom, setPan, fitToWindow, reset, showZoomIndicator }}
 */
export function useZoomPan(containerRef, contentWidth, contentHeight, options = {}) {
  const { zoomStep = ZOOM_STEP, smoothZoom = true } = options;

  const [zoom, setZoomState] = useState(1);
  const [pan, setPanState] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  // 仅在一次缩放动作后短暂置真，用于给 transform 挂过渡；平移时不加，避免拖拽发黏
  const [isZooming, setIsZooming] = useState(false);

  const stateRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const panStartRef = useRef(null);
  const spaceDownRef = useRef(false);
  const zoomIndicatorTimer = useRef(null);
  const zoomingTimer = useRef(null);
  const dragStartRef = useRef(null);
  const dragPanStartedRef = useRef(false);

  // 在 useEffect 中更新 ref，不在 render 中写 ref
  useEffect(() => {
    stateRef.current = { zoom, pan };
  }, [zoom, pan]);

  const flashZoomIndicator = useCallback(() => {
    setShowZoomIndicator(true);
    if (zoomIndicatorTimer.current) clearTimeout(zoomIndicatorTimer.current);
    zoomIndicatorTimer.current = setTimeout(() => setShowZoomIndicator(false), 300);

    if (smoothZoom) {
      setIsZooming(true);
      if (zoomingTimer.current) clearTimeout(zoomingTimer.current);
      zoomingTimer.current = setTimeout(() => setIsZooming(false), ZOOM_ANIMATION_DURATION);
    }
  }, [smoothZoom]);

  // 卸载时清掉两个定时器，避免在已卸载组件上 setState
  useEffect(() => () => {
    if (zoomIndicatorTimer.current) clearTimeout(zoomIndicatorTimer.current);
    if (zoomingTimer.current) clearTimeout(zoomingTimer.current);
  }, []);

  const setZoom = useCallback((newZoom) => {
    const clamped = clampZoom(newZoom);
    setZoomState(clamped);
    flashZoomIndicator();
  }, [flashZoomIndicator]);

  const setPan = useCallback((newPan) => {
    setPanState(newPan);
  }, []);

  /**
   * 以指定点为中心缩放
   * 关键: 用 clamp 后的实际 zoom 值计算 pan，避免边界处鼠标漂移
   */
  const zoomAtPoint = useCallback((clientX, clientY, deltaZoom) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    const { zoom: oldZoom, pan: oldPan } = stateRef.current;
    const requestedZoom = oldZoom + deltaZoom;
    const actualZoom = clampZoom(requestedZoom);

    if (actualZoom === oldZoom) return;

    // 保持鼠标下的图像点不动:
    // newPan = mousePos - (mousePos - oldPan) * (newZoom / oldZoom)
    const ratio = actualZoom / oldZoom;
    const newPan = {
      x: mx - (mx - oldPan.x) * ratio,
      y: my - (my - oldPan.y) * ratio,
    };

    setZoomState(actualZoom);
    setPanState(newPan);
    flashZoomIndicator();
  }, [containerRef, flashZoomIndicator]);

  const fitToWindow = useCallback(() => {
    const container = containerRef.current;
    if (!container || !contentWidth || !contentHeight) return;

    const rect = container.getBoundingClientRect();
    const ratio = Math.min(rect.width / contentWidth, rect.height / contentHeight, 1);

    const fitZoom = clampZoom(ratio);
    const fitPan = {
      x: (rect.width - contentWidth * fitZoom) / 2,
      y: (rect.height - contentHeight * fitZoom) / 2,
    };

    setZoomState(fitZoom);
    setPanState(fitPan);
    flashZoomIndicator();
  }, [containerRef, contentWidth, contentHeight, flashZoomIndicator]);

  const reset = useCallback(() => {
    setZoomState(1);
    setPanState({ x: 0, y: 0 });
    flashZoomIndicator();
  }, [flashZoomIndicator]);

  // 滚轮缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? zoomStep : -zoomStep;
      zoomAtPoint(e.clientX, e.clientY, delta);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [containerRef, zoomAtPoint, zoomStep]);

  // 空格 + 拖动平移
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 方向键每次平移的像素量 (§11.1)
    const PAN_STEP = 40;

    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.code === 'Space') {
        if (typing || spaceDownRef.current) return;
        spaceDownRef.current = true;
        container.style.cursor = 'grab';
        return;
      }

      // 方向键平移：pan 增大表示内容往右下走，视口相对往上/左看
      if (typing) return;
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case 'ArrowUp': dy = PAN_STEP; break;
        case 'ArrowDown': dy = -PAN_STEP; break;
        case 'ArrowLeft': dx = PAN_STEP; break;
        case 'ArrowRight': dx = -PAN_STEP; break;
        default: return;
      }
      e.preventDefault();
      const { pan: p } = stateRef.current;
      setPanState({ x: p.x + dx, y: p.y + dy });
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
        container.style.cursor = '';
      }
    };

    const handleBlur = () => {
      spaceDownRef.current = false;
      container.style.cursor = '';
    };

    const handleMouseDown = (e) => {
      if (e.button !== 0 && e.button !== 1 && !spaceDownRef.current) return;
      // 记录按下位置，不立即平移——等 mousemove 判断位移
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      dragPanStartedRef.current = false;
      e.preventDefault();
    };

    const handleMouseMove = (e) => {
      // 已有平移进行中
      if (isPanning && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.startX;
        const dy = e.clientY - panStartRef.current.startY;
        setPanState({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        });
        return;
      }
      // 拖拽判定：按下后位移 > 3px → 开始平移
      if (dragStartRef.current && !dragPanStartedRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        if (Math.hypot(dx, dy) > 3) {
          dragPanStartedRef.current = true;
          setIsPanning(true);
          container.style.cursor = 'grabbing';
          panStartRef.current = {
            startX: e.clientX - dx,
            startY: e.clientY - dy,
            panX: stateRef.current.pan.x,
            panY: stateRef.current.pan.y,
          };
        }
      }
    };

    const handleMouseUp = (e) => {
      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        container.style.cursor = spaceDownRef.current ? 'grab' : '';
      }
      // 位移 < 3px 且未平移 → 视为点击
      if (dragStartRef.current && !dragPanStartedRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        if (Math.hypot(dx, dy) <= 3) {
          container.dispatchEvent(new MouseEvent('click', {
            clientX: e.clientX, clientY: e.clientY, bubbles: true,
          }));
        }
      }
      dragStartRef.current = null;
      dragPanStartedRef.current = false;
    };

    // 双击: 100% <-> 适应窗口
    const handleDoubleClick = () => {
      const { zoom: currentZoom } = stateRef.current;
      if (Math.abs(currentZoom - 1) < 0.01) {
        fitToWindow();
      } else {
        reset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('dblclick', handleDoubleClick);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [containerRef, isPanning, fitToWindow, reset]);

  // 窗口 resize: 若处于适应窗口则重新计算
  useEffect(() => {
    const handleResize = () => {
      const { zoom: cz } = stateRef.current;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const fitRatio = Math.min(rect.width / contentWidth, rect.height / contentHeight, 1);
      if (Math.abs(cz - fitRatio) < 0.05) {
        fitToWindow();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [containerRef, contentWidth, contentHeight, fitToWindow]);

  return {
    zoom,
    pan,
    isPanning,
    isZooming,
    zoomAtPoint,
    setZoom,
    setPan,
    fitToWindow,
    reset,
    showZoomIndicator,
  };
}
