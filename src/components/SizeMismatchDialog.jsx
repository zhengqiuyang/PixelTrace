import { useEffect, useRef } from 'react';

export default function SizeMismatchDialog({ open, message, onAlign, onKeep }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.showModal();
    } else if (dialogRef.current) {
      dialogRef.current.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="pixel-dialog"
      onClose={onKeep}
      onClick={(e) => {
        if (e.target === dialogRef.current) onKeep();
      }}
    >
      <div className="dialog-header">
        <span className="dialog-icon">⚠</span>
        <h3 className="dialog-title">图片尺寸不同</h3>
      </div>

      <p className="dialog-message">{message}</p>

      <div className="dialog-actions">
        <button className="pixel-btn" onClick={onKeep}>
          保持原样
        </button>
        <button className="pixel-btn accent" onClick={onAlign}>
          自动对齐（居中）
        </button>
      </div>
    </dialog>
  );
}
