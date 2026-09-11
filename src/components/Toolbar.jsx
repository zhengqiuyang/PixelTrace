import { useEffect, useCallback } from 'react';
import { useAppContext } from '../hooks/useAppContext.js';
import { useToast } from '../hooks/useToast.js';

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
export default function Toolbar({ stageRef }) {
  const { state, setView, clearImages } = useAppContext();
  const { zoom } = state;
  const { success: toastSuccess } = useToast();

  const handleExport = useCallback(() => {
    const canvas = document.querySelector('.view-canvas-wrapper canvas');
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.download = `pixeltrace-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toastSuccess('导出成功');
    } catch {
      toastSuccess('导出失败');
    }
  }, [toastSuccess]);

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

        // 操作
        case 'e': case 'E':
          e.preventDefault();
          handleExport();
          break;
        case 'f': case 'F':
          e.preventDefault();
          handleFullscreen();
          break;

        // 帮助
        case '?':
          e.preventDefault();
          toastSuccess('快捷键: 1-6视图 | +/-缩放 | 0适应 | E导出 | F全屏');
          break;

        case 'Escape':
          // 由各组件自行处理
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setView, zoom, stageRef, handleExport, handleFullscreen, toastSuccess]);

  return (
    <div className="result-toolbar">
      <button className="pixel-btn" onClick={clearImages}>
        ← 重新选择
      </button>

      <div className="toolbar-shortcuts">
        <span className="shortcut-hint" title="视图切换 1-6">1-6 视图</span>
        <span className="shortcut-hint" title="适应窗口">0 适应</span>
        <span className="shortcut-hint" title="放大/缩小 +/-">+/- 缩放</span>
        <span className="shortcut-hint" title="导出 PNG">E 导出</span>
        <span className="shortcut-hint" title="全屏切换">F 全屏</span>
        <span className="shortcut-hint" title="快捷键帮助">? 帮助</span>
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
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
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

      <button className="pixel-btn accent" onClick={handleExport}>
        导出 PNG ↓
      </button>
    </div>
  );
}
