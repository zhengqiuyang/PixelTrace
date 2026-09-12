import { useCallback } from 'react';
import { toast as sonnerToast } from 'sonner';
import { TOAST_DURATION } from '../utils/constants.js';

/**
 * Toast 适配器 —— 内部使用 sonner，外部接口保持不变。
 *
 * 这样所有现有代码里的 useToast().toast() / useToast().success()
 * 继续可用，不需要改动。底层换成 sonner 后自动获得：
 *   · 入场/出场动画（slide-in / slide-out）
 *   · 自动堆叠 + 最大数量限制
 *   · 点击关闭 + 按类型配色
 *   · 主题跟随（通过 sonner.jsx 里的 theme="system"）
 */

export const ToastContext = {
  // 占位：实际值在 ToastProvider 里通过 Context.Provider 注入
};

export function ToastProvider({ children }) {
  const toast = useCallback((message, { type = 'info', duration = TOAST_DURATION, ...opts } = {}) => {
    const id = sonnerToast(message, {
      type,
      duration: duration > 0 ? duration : undefined,
      ...opts,
    });
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    sonnerToast.dismiss(id);
  }, []);

  const success = useCallback((message, options) => toast(message, { ...options, type: 'success' }), [toast]);
  const error = useCallback((message, options) => toast(message, { ...options, type: 'error' }), [toast]);
  const warning = useCallback((message, options) => toast(message, { ...options, type: 'warning' }), [toast]);
  const info = useCallback((message, options) => toast(message, { ...options, type: 'info' }), [toast]);

  // 提供空 children（不再渲染自定 toast container）
  return <>{children}</>;
}