import { useEffect, useRef } from 'react';

/**
 * Dialog 组件 — 模态弹窗
 *
 * 用原生 <dialog> + showModal()，与 SizeMismatchDialog 保持同一套类名与样式
 * （.pixel-dialog / .dialog-header / .dialog-message / .dialog-actions）。
 * Esc 关闭由原生行为处理，会触发 close 事件回调 onClose。
 *
 * @param {{ open, title, message, actions: Array<{ label, variant?, onClick }>, onClose }} props
 */
export default function Dialog({ open, title, message, actions = [], onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="pixel-dialog"
      onClose={() => onClose?.()}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose?.();
      }}
      aria-label={title}
    >
      <div className="dialog-header">
        <span className="dialog-icon">⚠</span>
        <h3 className="dialog-title">{title}</h3>
      </div>

      <p className="dialog-message">{message}</p>

      <div className="dialog-actions">
        {actions.map((a, i) => (
          <button
            key={i}
            className={`pixel-btn ${a.variant === 'primary' ? 'accent' : ''}`}
            onClick={() => {
              a.onClick?.();
              onClose?.();
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </dialog>
  );
}
