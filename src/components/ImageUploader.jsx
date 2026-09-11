import { useRef, useState, useCallback } from 'react';
import { useToast } from '../hooks/useToast.js';
import Dialog from './Dialog';
import {
  SUPPORTED_FORMATS,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  SCALE_TARGET_WIDTH,
  SCALE_TARGET_HEIGHT,
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

function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('corrupted'));
    img.src = dataUrl;
  });
}

/** 等比缩到 SCALE_TARGET 以内（仅用于内存不足时的降级，不再作为上传闸门） */
function downscaleToLimit(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const ratio = Math.min(SCALE_TARGET_WIDTH / w, SCALE_TARGET_HEIGHT / h, 1);
  const targetW = Math.max(1, Math.round(w * ratio));
  const targetH = Math.max(1, Math.round(h * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  canvas.getContext('2d').drawImage(img, 0, 0, targetW, targetH);

  return { dataUrl: canvas.toDataURL('image/png'), width: targetW, height: targetH };
}

export default function ImageUploader({ label, onImageLoad, side: _side }) {
  const inputRef = useRef(null);
  const [state, setState] = useState(UPLOAD_STATES.EMPTY);
  const [preview, setPreview] = useState(null);
  const [meta, setMeta] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  // 待用户决策的上传: { error, file }
  const [pending, setPending] = useState(null);
  const { toast } = useToast();

  const reset = useCallback(() => {
    setState(UPLOAD_STATES.EMPTY);
    setPreview(null);
    setMeta(null);
    setErrorMsg('');
    setPending(null);
    onImageLoad(null);
  }, [onImageLoad]);

  /** 提交成功结果 */
  const commit = useCallback((img, dataUrl, info) => {
    setPreview(dataUrl);
    setMeta(info);
    setState(UPLOAD_STATES.UPLOADED);
    onImageLoad(img, info);
  }, [onImageLoad]);

  /**
   * 加载文件并提交。
   * 尺寸不再做任何校验 —— 4096×4096 的上传闸门已取消，
   * 任意像素尺寸的图片都直接进入比较流程。
   */
  const loadFile = useCallback(async (file) => {
    setState(UPLOAD_STATES.LOADING);
    try {
      const { img, dataUrl } = await loadImage(file);

      commit(img, dataUrl, {
        fileName: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
        fileSize: file.size,
        format: file.name.split('.').pop().toUpperCase(),
      });
    } catch {
      setState(UPLOAD_STATES.ERROR);
      setErrorMsg(ERROR_MESSAGES.CORRUPTED.message);
      toast(ERROR_MESSAGES.CORRUPTED.message, { type: 'error' });
    }
  }, [commit, toast]);

  const processFile = useCallback((file) => {
    const validation = validateFile(file);

    if (!validation.ok) {
      // 类型不支持 / 文件损坏 —— 直接拒绝
      if (!validation.error.canContinue && !validation.error.canScale) {
        setState(UPLOAD_STATES.ERROR);
        setErrorMsg(validation.error.message);
        toast(validation.error.message, { type: 'error' });
        return;
      }
      // 文件过大等可继续的情况 —— 弹窗让用户选
      setPending({ error: validation.error, file });
      return;
    }

    loadFile(file);
  }, [loadFile, toast]);

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

  // ─── 弹窗动作 ───

  const cancelPending = useCallback(() => {
    setPending(null);
  }, []);

  /** 继续上传：忽略体积限制，直接加载 */
  const continueAnyway = useCallback(() => {
    const p = pending;
    if (!p) return;
    setPending(null);
    loadFile(p.file);
  }, [pending, loadFile]);

  /** 缩放后继续：等比缩到 SCALE_TARGET 以内（内存不足时的降级路径） */
  const scaleAndContinue = useCallback(async () => {
    const p = pending;
    if (!p) return;
    setPending(null);
    setState(UPLOAD_STATES.LOADING);
    try {
      const { img: source } = await loadImage(p.file);
      const scaled = downscaleToLimit(source);
      const img = await imageFromDataUrl(scaled.dataUrl);

      commit(img, scaled.dataUrl, {
        fileName: p.file.name,
        width: scaled.width,
        height: scaled.height,
        fileSize: p.file.size,
        format: 'PNG',
      });
      toast(`已缩放至 ${scaled.width} × ${scaled.height}`, { type: 'success' });
    } catch {
      setState(UPLOAD_STATES.ERROR);
      setErrorMsg(ERROR_MESSAGES.CORRUPTED.message);
      toast(ERROR_MESSAGES.CORRUPTED.message, { type: 'error' });
    }
  }, [pending, commit, toast]);

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // 目前只有 FILE_TOO_LARGE（体积）会走到弹窗；尺寸闸门取消后不再有尺寸类拦截。
  // OUT_OF_MEMORY 保留标题，等它的产出端接上后即可直接生效。
  const DIALOG_TITLES = {
    FILE_TOO_LARGE: '文件过大',
    OUT_OF_MEMORY: '图片过大',
  };
  const dialogTitle = pending ? (DIALOG_TITLES[pending.error.code] ?? '提示') : '';

  // ─── 各状态内容 ───
  let content;

  if (state === UPLOAD_STATES.UPLOADED && preview) {
    content = (
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
  } else if (state === UPLOAD_STATES.LOADING) {
    content = (
      <div className="uploader-zone loading">
        <div className="uploader-loading">
          <span className="loading-pixel">█</span>
          <span className="loading-pixel">▀</span>
          <span className="loading-pixel">█</span>
        </div>
        <p className="uploader-hint">加载中...</p>
      </div>
    );
  } else if (state === UPLOAD_STATES.ERROR) {
    content = (
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
  } else {
    content = (
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

  // 按钮按 constants.js 的 canContinue / canScale 标志生成
  const dialogActions = [];
  if (pending) {
    if (pending.error.canContinue) {
      dialogActions.push({ label: '继续上传', onClick: continueAnyway });
    }
    if (pending.error.canScale) {
      dialogActions.push({ label: '缩放后继续', variant: 'primary', onClick: scaleAndContinue });
    }
    dialogActions.push({ label: '取消', onClick: cancelPending });
  }

  return (
    <>
      {content}
      <Dialog
        open={!!pending}
        title={dialogTitle}
        message={pending?.error.message}
        actions={dialogActions}
        onClose={cancelPending}
      />
    </>
  );
}
