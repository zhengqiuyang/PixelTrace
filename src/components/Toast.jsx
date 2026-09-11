import { useState, useCallback, createContext } from 'react';
import { TOAST_DURATION } from '../utils/constants.js';

const ToastContext = createContext(null);

export { ToastContext };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, { type = 'info', duration = TOAST_DURATION } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 语义化快捷方式：Toolbar / ComparisonView 按 success(...) 调用
  const success = useCallback((message, options) => toast(message, { ...options, type: 'success' }), [toast]);
  const error = useCallback((message, options) => toast(message, { ...options, type: 'error' }), [toast]);
  const warning = useCallback((message, options) => toast(message, { ...options, type: 'warning' }), [toast]);
  const info = useCallback((message, options) => toast(message, { ...options, type: 'info' }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, dismiss, success, error, warning, info }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            onClick={() => dismiss(t.id)}
          >
            <span className="toast-icon">
              {t.type === 'error' ? '✕' : t.type === 'warning' ? '⚠' : t.type === 'success' ? '✓' : 'ℹ'}
            </span>
            <span className="toast-message">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
