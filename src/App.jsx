import { useCallback, useEffect, useRef, useState } from 'react';
import { AppProvider } from './store/AppContext.jsx';
import { useAppContext } from './hooks/useAppContext.js';
import { useToast } from './hooks/useToast.js';
import { ToastProvider } from './components/Toast.jsx';
import { loadImageFromFile } from './utils/imageLoader.js';
import { applyTheme, storeTheme, themeMeta, nextTheme } from './utils/theme.js';
import ImageUploader from './components/ImageUploader';
import ComparisonView from './components/ComparisonView';
import Toolbar from './components/Toolbar';
import ShortcutsDialog from './components/ShortcutsDialog';
import ExportDialog from './components/ExportDialog';
import BatchView from './components/BatchView';
import './App.css';

/** 两种工作模式：单对深看 / 文件夹批量扫描 */
const MODES = [
  { key: 'single', label: '单对对比', crumb: '图片对比' },
  { key: 'batch', label: '文件夹批量', crumb: '批量对比' },
];

function AppContent() {
  const { state, setImage, toggleTheme } = useAppContext();
  const { images, theme } = state;
  const hasBoth = images.left && images.right;
  const stageRef = useRef(null);
  // 弹窗开合放在这里，工具栏的「设置」按钮与 ComparisonView 里的面板要共用同一份状态
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // 把主题同步到 <html> 上，并记住用户的选择。
  // 首帧不靠这里 —— index.html 里的内联脚本已经在解析阶段设好了，
  // 否则亮色用户每次刷新都要先闪一帧暗色。这里只负责「切换之后」。
  // 写 DOM / 写 localStorage 都属于「与外部系统同步」，放在 effect 里是正当用法。
  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  const themeInfo = themeMeta(theme);
  const nextThemeInfo = themeMeta(nextTheme(theme));

  // 模式是 App 级状态而不是路由：两条链路共用同一份 images / settings，
  // 从批量结果点进单对时不需要重新选图，来回切也只是换一棵子树。
  const [mode, setMode] = useState('single');
  const [openingPair, setOpeningPair] = useState(false);
  const { error: toastError } = useToast();

  // 导出所需的数据快照。ComparisonView 是这些数据的持有者（mask / regions / stats
  // 都在它的 useImageDiff 里），而触发导出的按钮在 Toolbar —— 两者是兄弟节点。
  // 用 ref 中转而不是提升到 state：mask 是几 MB 的 Uint8Array，
  // 放进 state 会让整棵树在每次差异重算后重渲染，而导出只在点击时读一次。
  const exportRef = useRef(null);

  // 打开弹窗的快捷键由 App 统一处理 —— 弹窗状态在这里，
  // 而且 ? 在上传页也应该能用（此时 Toolbar 还没挂载）
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // 带修饰键的分支必须在下面那条「有修饰键就直接返回」之前判断，
      // 否则永远走不到这里。
      // 注意用 toLowerCase 比较：按住 Shift 时 e.key 是大写的 'E'，
      // 直接写 e.key === 'e' 会漏掉这个组合键。
      if (e.key.toLowerCase() === 'e' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        // Ctrl+Shift+E 打开导出面板；单按 E / Ctrl+E 仍是快速导出 PNG（见 Toolbar）
        if (hasBoth && mode === 'single') {
          e.preventDefault();
          setExportOpen(true);
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === ',' && hasBoth && mode === 'single') {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasBoth, mode]);

  /**
   * 批量结果表 → 单对对比视图的接缝。
   *
   * 批量只回答「哪几张变了」，具体变在哪必须回到单对视图才看得见 ——
   * 没有这条缝，批量就只能给结论、给不出证据。
   *
   * 两个文件并发解码：串行会让「点一下等两轮」的迟滞很明显，
   * 而这里最多同时开两张，不存在内存压力。
   */
  const handleOpenPair = useCallback(async (row) => {
    if (openingPair) return;
    setOpeningPair(true);
    try {
      const [left, right] = await Promise.all([
        loadImageFromFile(row.fileA),
        loadImageFromFile(row.fileB),
      ]);
      setImage('left', left.img, left.meta);
      setImage('right', right.img, right.meta);
      setMode('single');
    } catch (err) {
      console.error('载入这一对失败:', err);
      toastError('这一对图片无法载入，可能已损坏');
    } finally {
      setOpeningPair(false);
    }
  }, [openingPair, setImage, toastError]);

  const currentCrumb = MODES.find((m) => m.key === mode)?.crumb ?? '';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <nav className="breadcrumb" aria-label="面包屑导航">
            <span className="breadcrumb-item breadcrumb-app">PixelTrace</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-item breadcrumb-current">{currentCrumb}</span>
          </nav>

          <div className="mode-switch" role="group" aria-label="切换对比模式">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`mode-btn ${mode === m.key ? 'active' : ''}`}
                aria-pressed={mode === m.key}
                onClick={() => setMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="header-logo">
            <span className="logo-pixel">█</span>
            <span className="logo-text">PIXEL</span>
            <span className="logo-trace">TRACE</span>
          </div>
          <span className="header-version">v1.0</span>

          {/* 主题开关放在顶栏最右侧：上传页和结果页都能碰到，
              不像设置面板只在对比视图里才有 */}
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title={`当前${themeInfo.label}主题 —— 点击切换到${nextThemeInfo.label}`}
            aria-label={`当前为${themeInfo.label}主题，点击切换到${nextThemeInfo.label}主题`}
          >
            <span className="theme-toggle-icon" aria-hidden="true">{themeInfo.icon}</span>
            <span className="theme-toggle-label">{themeInfo.label}</span>
          </button>
        </div>
      </header>

      {/* 两块面板都常驻挂载，只切换可见性。
          卸载重建的代价太大：从批量结果点进单对看细节，再切回批量时，
          已经跑完的几十张结果、进度、选好的文件夹全没了，
          用户得重新选一遍文件夹再跑一遍 —— 这个代价远大于多留一棵 DOM。
          ComparisonView 同理：切走再切回不会重算差异。 */}
      <div className="mode-panes">
        <div className={`mode-pane ${mode === 'batch' ? '' : 'mode-pane--hidden'}`}>
          <BatchView onExit={() => setMode('single')} onOpenPair={handleOpenPair} />
        </div>

        <div className={`mode-pane ${mode === 'single' ? '' : 'mode-pane--hidden'}`}>
          {!hasBoth ? (
            <div className="upload-section">
              <div className="upload-grid">
                <ImageUploader
                  label="原始图片"
                  side="left"
                  onImageLoad={(img, meta) => setImage('left', img, meta)}
                />
                <div className="upload-divider">
                  <div className="divider-line" />
                  <span className="divider-icon">VS</span>
                  <div className="divider-line" />
                </div>
                <ImageUploader
                  label="修改后图片"
                  side="right"
                  onImageLoad={(img, meta) => setImage('right', img, meta)}
                />
              </div>
              <p className="upload-tip">
                上传两张图片以开始比较差异，或
                <button
                  type="button"
                  className="upload-tip-link"
                  onClick={() => setMode('batch')}
                >
                  对比两个文件夹
                </button>
              </p>
            </div>
          ) : (
            <div className="result-section">
              <Toolbar
                stageRef={stageRef}
                exportRef={exportRef}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenExport={() => setExportOpen(true)}
                onOpenHelp={() => setHelpOpen(true)}
              />
              <ComparisonView
                img1={images.left}
                img2={images.right}
                stageRef={stageRef}
                exportRef={exportRef}
                settingsOpen={settingsOpen}
                onCloseSettings={() => setSettingsOpen(false)}
              />
            </div>
          )}
        </div>
      </div>

      {openingPair && (
        <div className="pair-loading" role="status">正在载入这一对图片…</div>
      )}

      <footer className="app-footer">
        <span className="footer-pixel">▪▪▪</span>
        <span>PIXELTRACE — 像素级图像差异分析</span>
        <span className="footer-pixel">▪▪▪</span>
      </footer>

      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        exportRef={exportRef}
      />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AppProvider>
  );
}

export default App;
