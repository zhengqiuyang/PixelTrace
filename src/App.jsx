import { useEffect, useRef, useState } from 'react';
import { AppProvider } from './store/AppContext.jsx';
import { useAppContext } from './hooks/useAppContext.js';
import { ToastProvider } from './components/Toast.jsx';
import ImageUploader from './components/ImageUploader';
import ComparisonView from './components/ComparisonView';
import Toolbar from './components/Toolbar';
import ShortcutsDialog from './components/ShortcutsDialog';
import ExportDialog from './components/ExportDialog';
import './App.css';

function AppContent() {
  const { state, setImage } = useAppContext();
  const { images } = state;
  const hasBoth = images.left && images.right;
  const stageRef = useRef(null);
  // 弹窗开合放在这里，工具栏的「设置」按钮与 ComparisonView 里的面板要共用同一份状态
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

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
        if (hasBoth) {
          e.preventDefault();
          setExportOpen(true);
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === ',' && hasBoth) {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasBoth]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <nav className="breadcrumb" aria-label="面包屑导航">
            <span className="breadcrumb-item breadcrumb-app">PixelTrace</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-item breadcrumb-current">图片对比</span>
          </nav>
          <div className="header-logo">
            <span className="logo-pixel">█</span>
            <span className="logo-text">PIXEL</span>
            <span className="logo-trace">TRACE</span>
          </div>
          <span className="header-version">v1.0</span>
        </div>
      </header>

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
          <p className="upload-tip">上传两张图片以开始比较差异</p>
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
