import { useRef, useState, useCallback } from 'react';
import { useToast } from '../hooks/useToast.js';
import {
  SUPPORTED_FORMATS,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_WIDTH,
  MAX_IMAGE_HEIGHT,
  UPLOAD_STATES,
  ERROR_MESSAGES,
} from '../utils/constants.js';

function validateFile(file) {
  if (!file) return { ok: false, error: ERROR_MESSAGES.CORRUPTED };

  if (!SUPPORTED_FORMATS.includes(file.type)) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return { ok: false, error: ERROR_MESSAGES.UNSUPPORTED_FORMAT };
    }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: { ...ERROR_MESSAGES.FILE_TOO_LARGE, message: ERROR_MESSAGES.FILE_TOO_LARGE.message(sizeMB) },
    };
  }

  return { ok: true };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          reject(new Error('corrupted'));
          return;
        }
        // GIF 取第一帧（已经是第一帧了）
        resolve({ img, dataUrl: e.target.result });
      };
      img.onerror = () => reject(new Error('corrupted'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('corrupted'));
    reader.readAsDataURL(file);
  });
}

export default function ImageUploader({ label, onImageLoad, side: _side }) {
  const inputRef = useRef(null);
  const [state, setState] = useState(UPLOAD_STATES.EMPTY);
  const [preview, setPreview] = useState(null);
  const [meta, setMeta] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const { toast } = useToast();

  const reset = useCallback(() => {
    setState(UPLOAD_STATES.EMPTY);
    setPreview(null);
    setMeta(null);
    setErrorMsg('');
    onImageLoad(null);
  }, [onImageLoad]);

  const processFile = useCallback(async (file) => {
    // 1. 类型/大小校验
    const validation = validateFile(file);
    if (!validation.ok) {
      if (validation.error.canContinue || validation.error.canScale) {
        // 需要用户决策 — 简化处理：显示错误 toast 并继续尝试
        toast(validation.error.message, { type: 'warning', duration: 5000 });
        if (!validation.error.canScale) return;
      } else {
        setState(UPLOAD_STATES.ERROR);
        setErrorMsg(validation.error.message);
        toast(validation.error.message, { type: 'error' });
        return;
      }
    }

    // 2. 加载图片
    setState(UPLOAD_STATES.LOADING);
    try {
      const { img, dataUrl } = await loadImage(file);

      // 3. 尺寸校验
      if (img.naturalWidth > MAX_IMAGE_WIDTH || img.naturalHeight > MAX_IMAGE_HEIGHT) {
        toast(
          ERROR_MESSAGES.IMAGE_TOO_BIG.message(img.naturalWidth, img.naturalHeight),
          { type: 'warning', duration: 5000 }
        );
        // 允许继续
      }

      const format = file.name.split('.').pop().toUpperCase();
      const fileInfo = {
        fileName: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
        fileSize: file.size,
        format,
      };

      setPreview(dataUrl);
      setMeta(fileInfo);
      setState(UPLOAD_STATES.UPLOADED);
      onImageLoad(img, fileInfo);
    } catch {
      setState(UPLOAD_STATES.ERROR);
      setErrorMsg(ERROR_MESSAGES.CORRUPTED.message);
      toast(ERROR_MESSAGES.CORRUPTED.message, { type: 'error' });
    }
  }, [onImageLoad, toast]);

  const handleFile = useCallback((file) => {
    if (file) processFile(file);
  }, [processFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setState((prev) => prev === UPLOAD_STATES.DRAG_OVER ? UPLOAD_STATES.EMPTY : prev);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    setState(UPLOAD_STATES.DRAG_OVER);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setState(UPLOAD_STATES.EMPTY);
  }, []);

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ─── 已上传状态 ───
  if (state === UPLOAD_STATES.UPLOADED && preview) {
    return (
      <div className="uploader-preview">
        <img src={preview} alt={label} />
        {meta && (
          <p className="uploader-meta">
            {meta.width} × {meta.height} | {formatSize(meta.fileSize)} | {meta.format}
          </p>
        )}
        <button className="pixel-btn small" onClick={reset}>✕ 移除</button>
      </div>
    );
  }

  // ─── 加载中状态 ───
  if (state === UPLOAD_STATES.LOADING) {
    return (
      <div className="uploader-zone loading">
        <div className="uploader-loading">
          <span className="loading-pixel">█</span>
          <span className="loading-pixel">▀</span>
          <span className="loading-pixel">█</span>
        </div>
        <p className="uploader-hint">加载中...</p>
      </div>
    );
  }

  // ─── 错误状态 ───
  if (state === UPLOAD_STATES.ERROR) {
    return (
      <div className="uploader-zone error" onClick={reset}>
        <div className="uploader-icon">
          <span className="pixel-bracket" style={{ color: 'var(--danger)' }}>[</span>
          <span className="pixel-plus" style={{ color: 'var(--danger)' }}>✕</span>
          <span className="pixel-bracket" style={{ color: 'var(--danger)' }}>]</span>
        </div>
        <p className="uploader-hint" style={{ color: 'var(--danger)' }}>{errorMsg}</p>
        <p className="uploader-hint">点击重试</p>
      </div>
    );
  }

  // ─── 默认/拖拽悬浮 状态 ───
  return (
    <div
      className={`uploader-zone ${state === UPLOAD_STATES.DRAG_OVER ? 'drag-over' : ''}`}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="uploader-icon">
        <span className="pixel-bracket">[</span>
        <span className="pixel-plus">+</span>
        <span className="pixel-bracket">]</span>
      </div>
      <p className="uploader-label">{label}</p>
      <p className="uploader-hint">
        {state === UPLOAD_STATES.DRAG_OVER ? '释放以上传' : '拖放图片或点击选择'}
      </p>
      <p className="uploader-formats">JPG / PNG / WebP / GIF</p>
    </div>
  );
}
