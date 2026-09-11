import { useRef, useEffect, useState, useCallback } from 'react';
import { useAppContext } from '../hooks/useAppContext.js';
import { useImageDiff } from '../hooks/useImageDiff.js';
import { useToast } from '../hooks/useToast.js';
import { detectSizeMismatch, alignImages } from '../utils/imageDiff.js';
import { VIEW_LIST } from '../utils/constants.js';
import CanvasStage from './CanvasStage.jsx';
import SliderView from './SliderView';
import SplitView from './SplitView';
import FadeView from './FadeView';
import BlinkView from './BlinkView';
import SubtractView from './SubtractView';
import HighlightView from './HighlightView';
import ChangeList from './ChangeList';
import SizeMismatchDialog from './SizeMismatchDialog';
import PixelMagnifier from './PixelMagnifier';
import SliderLine from './SliderLine';
import StatusBar from './StatusBar';

function doAlign(imgA, imgB) {
  const c1 = document.createElement('canvas');
  c1.width = imgA.naturalWidth || imgA.width;
  c1.height = imgA.naturalHeight || imgA.height;
  c1.getContext('2d').drawImage(imgA, 0, 0);
  const data1 = c1.getContext('2d').getImageData(0, 0, c1.width, c1.height);

  const c2 = document.createElement('canvas');
  c2.width = imgB.naturalWidth || imgB.width;
  c2.height = imgB.naturalHeight || imgB.height;
  c2.getContext('2d').drawImage(imgB, 0, 0);
  const data2 = c2.getContext('2d').getImageData(0, 0, c2.width, c2.height);

  const { a: alignedA, b: alignedB } = alignImages(data1, data2, { mode: 'center' });

  const outA = document.createElement('canvas');
  outA.width = alignedA.width;
  outA.height = alignedA.height;
  outA.getContext('2d').putImageData(alignedA, 0, 0);

  const outB = document.createElement('canvas');
  outB.width = alignedB.width;
  outB.height = alignedB.height;
  outB.getContext('2d').putImageData(alignedB, 0, 0);

  return { a: outA, b: outB };
}

const DISPLAY_MODES = [
  { key: 'overlay', label: '叠加' },
  { key: 'diff-only', label: '差异' },
];

export default function ComparisonView({ img1, img2, stageRef: externalStageRef }) {
  const { state, setView, setSelectedRegion, updateSettings, setAppZoom } = useAppContext();
  const { view, settings, selectedRegion } = state;
  const containerRef = useRef(null);
  const internalStageRef = useRef(null);
  const stageRef = externalStageRef || internalStageRef;
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [alignedImgs, setAlignedImgs] = useState({ a: null, b: null });
  const { success: toastSuccess } = useToast();
  const sizeCheckedRef = useRef(false);
  const [sizeDialog, setSizeDialog] = useState({ open: false, message: '' });

  const [displayMode, setDisplayMode] = useState('overlay');

  // 淡化视图透明度
  const [fadeOpacity, setFadeOpacity] = useState(0.5);

  // 像素放大镜
  const [magnifier, setMagnifier] = useState({ visible: false, x: 0, y: 0 });
  const canvasWrapperRef = useRef(null);
  const [magnifierRect, setMagnifierRect] = useState(null);
  // 闪烁视图当前显示的图
  const [blinkShowing, setBlinkShowing] = useState('a');

  const handleMouseMove = useCallback((e) => {
    if (!canvasWrapperRef.current) return;
    const rect = canvasWrapperRef.current.getBoundingClientRect();
    setMagnifier({ visible: true, x: e.clientX, y: e.clientY });
    setMagnifierRect(rect);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMagnifier((prev) => ({ ...prev, visible: false }));
  }, []);

  // 画布把缩放上报到全局，供工具栏与底部状态栏共用
  const handleZoomPanChange = useCallback((z) => setAppZoom(z.zoom), [setAppZoom]);

  // 尺寸检测 + 对齐
  useEffect(() => {
    if (!img1 && !img2) {
      setAlignedImgs({ a: null, b: null });
      sizeCheckedRef.current = false;
      return;
    }
    if (!img1 || !img2) return;

    const { sameSize, sizeDiffMessage } = detectSizeMismatch(img1, img2);

    if (!sameSize && !sizeCheckedRef.current) {
      sizeCheckedRef.current = true;
      setSizeDialog({ open: true, message: sizeDiffMessage });
      return;
    }

    if (sameSize) {
      sizeCheckedRef.current = false;
      setAlignedImgs({ a: null, b: null });
    }
  }, [img1, img2, toastSuccess]);

  const handleAlign = useCallback(() => {
    if (!img1 || !img2) return;
    const { a, b } = doAlign(img1, img2);
    setAlignedImgs({ a, b });
    setSizeDialog({ open: false, message: '' });
    toastSuccess('已自动对齐（居中填充）');
  }, [img1, img2, toastSuccess]);

  const handleKeepOriginal = useCallback(() => {
    setAlignedImgs({ a: null, b: null });
    setSizeDialog({ open: false, message: '' });
  }, []);

  const effectiveA = alignedImgs.a || img1;
  const effectiveB = alignedImgs.b || img2;

  // 原始分辨率 — CanvasStage 负责 zoom/pan/fit
  const imgW = effectiveA ? (effectiveA.naturalWidth || effectiveA.width) : 0;
  const imgH = effectiveA ? (effectiveA.naturalHeight || effectiveA.height) : 0;

  // 滑块拖拽
  const updateSlider = useCallback((clientX) => {
    const stage = document.querySelector('.canvas-stage');
    if (!stage || !imgW) return;
    const stageRect = stage.getBoundingClientRect();
    const viewportX = clientX - stageRect.left;
    const stageContent = document.querySelector('.canvas-stage-content');
    if (!stageContent) return;
    const style = window.getComputedStyle(stageContent);
    const transform = style.transform;
    let scale = 1, translateX = 0;
    if (transform && transform !== 'none') {
      const match = transform.match(/matrix\(([^)]+)\)/);
      if (match) {
        const vals = match[1].split(',').map(Number);
        scale = vals[0];
        translateX = vals[4];
      }
    }
    const imageX = (viewportX - translateX) / scale;
    setSliderPos(Math.max(0, Math.min(100, (imageX / imgW) * 100)));
    }, [imgW]);

  // useImageDiff 用 settings.threshold（滑块直接改 settings）
  const { diffImageData, mask, regions, stats, computing, progress } = useImageDiff(effectiveA, effectiveB, settings);

  const handleSelectRegion = useCallback((regionId) => {
    setSelectedRegion(regionId);
    if (regionId !== null && stageRef.current) {
      const region = regions.find((r) => r.id === regionId);
      if (region) {
        stageRef.current.zoomToRegion(region, imgW, imgH);
      }
    }
  }, [setSelectedRegion, regions, imgW, imgH, stageRef]);

  // 阈值滑块 → 直接改 settings.threshold → 触发 useImageDiff 重算
  const handleThresholdChange = useCallback((val) => {
    updateSettings({ threshold: val });
  }, [updateSettings]);

  const isSplitView = view === 'split';
  const isHighlightView = view === 'highlight';
  const isBlinkView = view === 'blink';
  const isFadeView = view === 'fade';
  const isSubtractView = view === 'subtract';
  const isSliderView = view === 'slider';

  // 滑块位置
  const [sliderPos, setSliderPos] = useState(50);
  const [isSliderDragging, setIsSliderDragging] = useState(false);

  // 闪烁速度
  const [blinkSpeed, setBlinkSpeed] = useState(500);
  // 闪烁暂停
  const [blinkPaused, setBlinkPaused] = useState(false);

  const handleSliderDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setIsSliderDragging(true);
    updateSlider(e.clientX);
  }, [updateSlider]);

  useEffect(() => {
    if (!isSliderDragging) return;
    const handleMove = (e) => updateSlider(e.clientX);
    const handleUp = () => setIsSliderDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isSliderDragging, updateSlider]);

  const renderView = () => {
    const props = {
      img1: effectiveA,
      img2: effectiveB,
      width: imgW,
      height: imgH,
      regions,
      stats,
      computing,
      progress,
      diffImageData,
      mask,
      selectedRegion,
      hoveredRegion,
      onSelectRegion: handleSelectRegion,
      threshold: settings.threshold,
      displayMode,
      onBlinkChange: setBlinkShowing,
      opacity: fadeOpacity,
      blinkSpeed,
      blinkPaused,
      sliderPos,
      // SplitView 自带一套 zoom/pan，同样需要上报，否则切换视图后缩放读数会停在旧值
      onZoomPanChange: handleZoomPanChange,
    };
    switch (view) {
      case 'slider': return <SliderView {...props} />;
      case 'split': return <SplitView {...props} />;
      case 'fade': return <FadeView {...props} />;
      case 'blink': return <BlinkView {...props} />;
      case 'subtract': return <SubtractView {...props} />;
      case 'highlight': return <HighlightView {...props} />;
      default: return null;
    }
  };

  const showSidebar = isHighlightView;

  // 放大镜：闪烁模式只显示当前图，其他模式显示两张
  const magnifierImgs = isBlinkView
    ? [blinkShowing === 'a' ? effectiveA : effectiveB]
    : [effectiveA, effectiveB];

  return (
    <div className="comparison-root">
      <div className="comparison-main" ref={containerRef}>
        <div className="view-switcher">
          {VIEW_LIST.map((v) => (
            <button
              key={v.key}
              className={`view-btn ${view === v.key ? 'active' : ''}`}
              onClick={() => setView(v.key)}
              aria-label={`切换到${v.label}视图`}
            >
              <span className="view-icon">{v.icon}</span>
              <span className="view-label">{v.label}</span>
            </button>
          ))}
        </div>

        <div
          ref={canvasWrapperRef}
          className="view-canvas-wrapper"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseDown={isSliderView ? handleSliderDown : undefined}
        >
          {isSplitView ? (
            renderView()
          ) : (
            <CanvasStage
              ref={stageRef}
              contentWidth={imgW}
              contentHeight={imgH}
              onZoomPanChange={(z) => setAppZoom(z.zoom)}
            >
              {renderView()}
            </CanvasStage>
          )}

          {isHighlightView && (
            <div className="highlight-controls highlight-controls--viewport">
              <div className="highlight-mode-btns">
                {DISPLAY_MODES.map((m) => (
                  <button
                    key={m.key}
                    className={`highlight-mode-btn ${displayMode === m.key ? 'active' : ''}`}
                    onClick={() => setDisplayMode(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <label>
                阈值: <span>{settings.threshold}</span>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={settings.threshold}
                  onChange={(e) => handleThresholdChange(Number(e.target.value))}
                />
              </label>
            </div>
          )}

          {isFadeView && (
            <div className="fade-controls fade-controls--viewport">
              <label>
                透明度: <span>{Math.round(fadeOpacity * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(fadeOpacity * 100)}
                  onChange={(e) => setFadeOpacity(Number(e.target.value) / 100)}
                />
              </label>
            </div>
          )}

          {isSubtractView && (
            <div className="view-controls view-controls--viewport">
              <label>
                阈值: <span>{settings.threshold}</span>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={settings.threshold}
                  onChange={(e) => handleThresholdChange(Number(e.target.value))}
                />
              </label>
            </div>
          )}

          {isBlinkView && (
            <div className="view-controls view-controls--viewport">
              <button
                className="blink-toggle-btn"
                onClick={() => setBlinkPaused((p) => !p)}
              >
                {blinkPaused ? '▶ 继续' : '⏸ 暂停'}
              </button>
              <label>
                速度: <span>{blinkSpeed}ms</span>
                <input
                  type="range"
                  min={100}
                  max={2000}
                  step={100}
                  value={blinkSpeed}
                  onChange={(e) => setBlinkSpeed(Number(e.target.value))}
                />
              </label>
            </div>
          )}

          {isSliderView && (
            <div className="slider-controls slider-controls--viewport">
              <div className="slider-label-left">原始</div>
              <span className="slider-pct">{Math.round(sliderPos)}%</span>
              <div className="slider-label-right">修改后</div>
            </div>
          )}

          {isSliderView && (
            <SliderLine sliderPos={sliderPos} width={imgW} height={imgH} />
          )}

          {isSplitView && (
            <div className="split-controls split-controls--viewport">
              <div className="split-label-left">原始</div>
              <div className="split-label-right">修改后</div>
            </div>
          )}
        </div>

        {computing && (
          <div className="computing-bar">
            正在计算差异... {progress}%
          </div>
        )}
      </div>

      {showSidebar && (
        <ChangeList
          regions={regions}
          stats={stats}
          img2={effectiveB}
          selectedRegion={selectedRegion}
          onSelectRegion={handleSelectRegion}
          hoveredRegion={hoveredRegion}
          onHoverRegion={setHoveredRegion}
        />
      )}

      <StatusBar
        image={effectiveA}
        mouseX={magnifier.x}
        mouseY={magnifier.y}
        hovering={magnifier.visible}
        regions={regions}
      />

      <PixelMagnifier
        imgs={magnifierImgs}
        mouseX={magnifier.x}
        mouseY={magnifier.y}
        containerRect={magnifierRect}
        visible={magnifier.visible}
      />

      <SizeMismatchDialog
        open={sizeDialog.open}
        message={sizeDialog.message}
        onAlign={handleAlign}
        onKeep={handleKeepOriginal}
      />
    </div>
  );
}
