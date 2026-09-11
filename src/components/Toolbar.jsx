import { useEffect, useState, useCallback } from 'react';
import { useAppContext } from '../hooks/useAppContext.js';
import { useToast } from '../hooks/useToast.js';
import { ZOOM_LEVELS } from '../utils/constants.js';
import { composeCurrentView, buildExportFilename, downloadBlob } from '../utils/exportView.js';

/**
 * 完整快捷键表 (PRD §11.1)
 * ──── 视图 ────
 * 1    SliderView (滑块)
 * 2    SplitView (分割)
 * 3    FadeView (淡化)
 * 4    BlinkView (闪烁)
 * 5    SubtractView (相减)
 * 6    HighlightView (高亮)
 * ──── 缩放/平移 ────
 * +/=  放大 25%
 * -/_  缩小 25%
 * 0    适应窗口 (fitToWindow)
 * Ctrl+0  重置为 100%
 * Home 适应窗口
 * ──── 操作 ────
 * E    导出 PNG
 * F    全屏切换
 * Space 拖拽平移 (hold)
 * ──── 其他 ────
 * ?    显示快捷键帮助
 * Escape 关闭弹窗/退出全屏
 */
export default function Toolbar({ stageRef, onOpenSettings, onOpenHelp }) {
  const { state, setView, clearImages } = useAppContext();
  const { view, zoom } = state;
  const { success: toastSuccess, error: toastError } = useToast();
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(() => {
    if (exporting) return;

    // 按当前视图的真实变换合成所有画布，而非只取第一个 canvas
    const canvas = composeCurrentView();
    if (!canvas) {
      toastError('当前视图暂无可导出的内容');
      return;
    }

    setExporting(true);
    canvas.toBlob((blob) => {
      setExporting(false);
      if (!blob) {
        toastError('导出失败，请重试');
        return;
      }
      downloadBlob(blob, buildExportFilename(view));
      toastSuccess('已导出当前视图');
    }, 'image/png');
  }, [exporting, view, toastSuccess, toastError]);

  /** 复制当前视图到剪贴板 (§10.3) —— 粘贴进飞书/钉钉/微信即可分享 */
  const handleCopy = useCallback(async () => {
    const canvas = composeCurrentView();
    if (!canvas) {
      toastError('当前视图暂无可复制的内容');
      return;
    }
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      toastError('当前浏览器不支持复制图片，请改用导出');
      return;
    }
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('toBlob 返回空');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toastSuccess('已复制到剪贴板');
    } catch (err) {
      // 非安全上下文（http 且非 localhost）或用户未授权时会走到这里
      console.error('复制到剪贴板失败:', err);
      toastError('复制失败，请改用导出');
    }
  }, [toastSuccess, toastError]);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const ctrl = e.ctrlKey || e.metaKey;

      switch (e.key) {
        // 视图切换
        case '1': e.preventDefault(); setView('slider'); break;
        case '2': e.preventDefault(); setView('split'); break;
        case '3': e.preventDefault(); setView('fade'); break;
        case '4': e.preventDefault(); setView('blink'); break;
        case '5': e.preventDefault(); setView('subtract'); break;
        case '6': e.preventDefault(); setView('highlight'); break;

        // 缩放
        case '+': case '=':
          e.preventDefault();
          stageRef?.current?.setZoom(zoom * 1.25);
          break;
        case '-': case '_':
          e.preventDefault();
          stageRef?.current?.setZoom(zoom / 1.25);
          break;
        case '0':
          e.preventDefault();
          if (ctrl) {
            stageRef?.current?.setZoom(1);
          } else {
            stageRef?.current?.fitToWindow();
          }
          break;
        case 'Home':
          e.preventDefault();
          stageRef?.current?.fitToWindow();
          break;

        // 操作（PRD §11.1 定义 Ctrl+E / Ctrl+S，单按 E 保留为便捷方式）
        case 'e': case 'E':
          e.preventDefault();
          handleExport();
          break;
        case 's': case 'S':
          if (!ctrl) break;
          e.preventDefault();
          handleExport();
          break;
        case 'c': case 'C':
          // 只认 Ctrl/Cmd+C，单按 c 不做事，避免误触
          if (!ctrl) break;
          // 页面上有选中文本时让浏览器自己复制，不要抢用户的 Ctrl+C
          if (!window.getSelection()?.isCollapsed) break;
          e.preventDefault();
          handleCopy();
          break;
        case 'f': case 'F':
          e.preventDefault();
          handleFullscreen();
          break;

        case 'Escape':
          // 由各组件自行处理
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setView, zoom, stageRef, handleExport, handleCopy, handleFullscreen]);

  // 缩放下拉：预设级别之外还可能出现任意倍率（滚轮/适应窗口），
  // 因此把当前值也塞进选项里，否则 select 会显示成空白
  const zoomPercent = Math.round(zoom * 100);
  const zoomLevels = ZOOM_LEVELS.map((z) => Math.round(z * 100));
  const zoomOptions = zoomLevels.includes(zoomPercent)
    ? zoomLevels
    : [...zoomLevels, zoomPercent].sort((a, b) => a - b);

  return (
    <div className="result-toolbar">
      <button className="pixel-btn" onClick={clearImages}>
        ← 重新选择
      </button>

      <div className="toolbar-shortcuts">
        <span className="shortcut-hint" title="视图切换 1-6">1-6 视图</span>
        <span className="shortcut-hint" title="适应窗口">0 适应</span>
        <span className="shortcut-hint" title="放大/缩小 +/-">+/- 缩放</span>
        <span className="shortcut-hint" title="方向键平移画布">↑↓←→ 平移</span>
        <span className="shortcut-hint" title="导出当前视图为 PNG">Ctrl+E 导出</span>
        <span className="shortcut-hint" title="复制当前视图到剪贴板">Ctrl+C 复制</span>
      </div>

      <div className="toolbar-spacer" />

      <div className="zoom-controls">
        <button
          className="zoom-btn"
          onClick={() => stageRef?.current?.setZoom(zoom / 1.25)}
          aria-label="缩小"
        >
          −
        </button>
        <select
          className="zoom-select"
          value={zoomPercent}
          onChange={(e) => stageRef?.current?.setZoom(Number(e.target.value) / 100)}
          aria-label="缩放级别"
        >
          {zoomOptions.map((p) => (
            <option key={p} value={p}>{p}%</option>
          ))}
        </select>
        <button
          className="zoom-btn"
          onClick={() => stageRef?.current?.setZoom(zoom * 1.25)}
          aria-label="放大"
        >
          +
        </button>
        <button
          className="zoom-btn zoom-fit"
          onClick={() => stageRef?.current?.fitToWindow()}
          aria-label="适应窗口"
        >
          ⊞
        </button>
      </div>

      <button
        className="pixel-btn"
        onClick={() => handleCopy()}
        aria-label="复制当前视图到剪贴板"
      >
        复制
      </button>

      <button
        className="pixel-btn"
        onClick={() => onOpenSettings?.()}
        aria-label="打开设置面板"
      >
        ≡ 设置
      </button>

      <button
        className="pixel-btn"
        onClick={() => onOpenHelp?.()}
        aria-label="查看键盘快捷键"
      >
        ⌨ 快捷键
      </button>

      <button
        className="pixel-btn accent"
        onClick={handleExport}
        disabled={exporting}
        aria-label="导出当前视图为 PNG"
      >
        {exporting ? '导出中...' : '导出 PNG ↓'}
      </button>
    </div>
  );
}
