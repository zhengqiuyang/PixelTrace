import { useEffect, useRef } from 'react';

/**
 * Dialog 组件 — 模态弹窗
 * @param {{ open, title, message, actions: Array<{ label, variant?, onClick }>, onClose }} props
 */
export default function Dialog({ open, title, message, actions = [], onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const first = dialogRef.current?.querySelector('button');
    if (first) first.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-header">
          <span className="dialog-title">{title}</span>
          {onClose && (
            <button className="dialog-close" onClick={onClose} aria-label="关闭">✕</button>
          )}
        </div>
        <div className="dialog-body">{message}</div>
        <div className="dialog-actions">
          {actions.map((a, i) => (
            <button
              key={i}
              className={`pixel-btn ${a.variant === 'primary' ? 'accent' : ''}`}
              onClick={() => { a.onClick?.(); onClose?.(); }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
