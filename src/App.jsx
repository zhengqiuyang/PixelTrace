import { useRef, useState } from 'react';
import { AppProvider } from './store/AppContext.jsx';
import { useAppContext } from './hooks/useAppContext.js';
import { ToastProvider } from './components/Toast.jsx';
import ImageUploader from './components/ImageUploader';
import ComparisonView from './components/ComparisonView';
import Toolbar from './components/Toolbar';
import './App.css';

function AppContent() {
  const { state, setImage } = useAppContext();
  const { images } = state;
  const hasBoth = images.left && images.right;
  const stageRef = useRef(null);
  // 弹窗开合放在这里，工具栏的「设置」按钮与 ComparisonView 里的面板要共用同一份状态
  const [settingsOpen, setSettingsOpen] = useState(false);

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
              onImageLoad={(img) => setImage('left', img)}
            />
            <div className="upload-divider">
              <div className="divider-line" />
              <span className="divider-icon">VS</span>
              <div className="divider-line" />
            </div>
            <ImageUploader
              label="修改后图片"
              side="right"
              onImageLoad={(img) => setImage('right', img)}
            />
          </div>
          <p className="upload-tip">上传两张图片以开始比较差异</p>
        </div>
      ) : (
        <div className="result-section">
          <Toolbar stageRef={stageRef} onOpenSettings={() => setSettingsOpen(true)} />
          <ComparisonView
            img1={images.left}
            img2={images.right}
            stageRef={stageRef}
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
