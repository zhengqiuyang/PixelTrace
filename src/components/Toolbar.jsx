import { useEffect, useState, useCallback } from 'react';
import { useAppContext } from '../hooks/useAppContext.js';
import { useToast } from '../hooks/useToast.js';
import { ZOOM_LEVELS } from '../utils/constants.js';
import { composeCurrentView } from '../utils/exportView.js';
import { runExport } from '../utils/exporters.js';
import { Button } from '@/components/ui/button';
import {
  RotateCcw, Copy, Settings, Keyboard, Download,
  Minus, Plus, Maximize,
} from 'lucide-react';

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
 * E / Ctrl+E       快速导出当前视图 PNG
 * Ctrl+Shift+E     打开导出面板（可选格式/质量/水印/区域标记）
 * F    全屏切换
 * Ctrl+C 复制当前视图到剪贴板
 * Space 拖拽平移 (hold)
 * ──── 其他 ────
 * ?    显示快捷键帮助
 * Escape 关闭弹窗/退出全屏
 */
export default function Toolbar({ stageRef, exportRef, onOpenSettings, onOpenExport, onOpenHelp }) {
  const { state, setView, clearImages } = useAppContext();
  const { zoom } = state;
  const { success: toastSuccess, error: toastError } = useToast();
  const [exporting, setExporting] = useState(false);

  /** 快速导出：当前视图 → PNG，不弹面板。Ctrl+E 与单按 E 走这条 */
  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await runExport(exportRef?.current, { kind: 'view', format: 'png' });
      if (!result.ok) {
        toastError(result.error ?? '导出失败，请重试');
        return;
      }
      toastSuccess('已导出当前视图');
    } finally {
      setExporting(false);
    }
  }, [exporting, exportRef, toastSuccess, toastError]);

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
          // Ctrl+Shift+E 归 App 管（打开导出面板），这里让路
          if (e.shiftKey) break;
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
      <Button variant="outline" size="sm" onClick={clearImages}>
        <RotateCcw className="h-3.5 w-3.5" />
        重新选择
      </Button>

      {/* 顺序 = 响应式优先级：越靠前越晚被裁掉。
          与 App.css 里 .toolbar-shortcuts 的 nth-child 断点一一对应，
          增删提示必须同步改那边的断点，否则会裁错项。 */}
      <div className="toolbar-shortcuts">
        <span className="shortcut-hint" title="视图切换 1-6">1-6 视图</span>
        <span className="shortcut-hint" title="适应窗口">0 适应</span>
        <span className="shortcut-hint" title="放大/缩小 +/-">+/- 缩放</span>
        <span className="shortcut-hint" title="方向键平移画布">↑↓←→ 平移</span>
        <span className="shortcut-hint" title="导出当前视图为 PNG">Ctrl+E 导出</span>
      </div>

      <div className="toolbar-spacer" />

      <div className="zoom-controls">
        <Button
          variant="icon"
          size="icon"
          onClick={() => stageRef?.current?.setZoom(zoom / 1.25)}
          aria-label="缩小"
        >
          <Minus className="h-4 w-4" />
        </Button>
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
        <Button
          variant="icon"
          size="icon"
          onClick={() => stageRef?.current?.setZoom(zoom * 1.25)}
          aria-label="放大"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="icon"
          size="icon"
          onClick={() => stageRef?.current?.fitToWindow()}
          aria-label="适应窗口"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      <Button variant="outline" size="sm" onClick={() => handleCopy()} aria-label="复制当前视图到剪贴板">
        <Copy className="h-3.5 w-3.5" />
        复制
      </Button>

      <Button variant="outline" size="sm" onClick={() => onOpenSettings?.()} aria-label="打开设置面板">
        <Settings className="h-3.5 w-3.5" />
        设置
      </Button>

      <Button variant="outline" size="sm" onClick={() => onOpenHelp?.()} aria-label="查看键盘快捷键">
        <Keyboard className="h-3.5 w-3.5" />
        快捷键
      </Button>

      <Button variant="accent" size="sm" onClick={() => onOpenExport?.()} aria-label="打开导出面板" disabled={exporting}>
        <Download className="h-3.5 w-3.5" />
        {exporting ? '导出中...' : '导出'}
      </Button>
    </div>
  );
}