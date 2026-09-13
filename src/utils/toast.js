import { toast as sonnerToast } from 'sonner';
import { TOAST_DURATION } from './constants.js';

/**
 * Toast 适配器 —— 内部用 sonner，外部保持项目原来的调用签名。
 *
 * 项目里 7 处调用方写的都是 useToast().toast() / .success() / .error()，
 * 这层把那套签名映射到 sonner，调用方零改动就拿到：
 *   · 入场/出场动画（slide-in / slide-out）
 *   · 自动堆叠 + 最大数量限制
 *   · 点击关闭 + 按类型配色（richColors）
 *   · 主题跟随（见 components/ui/sonner.jsx 里的 useAppTheme）
 *
 * ─── 为什么这里不用 React Context ───
 *
 * sonner 的 toast() 是模块级 API，直接调用即可，没有 Provider 要求。
 * 之前把 ToastContext 写成 {} 再交给 useContext() 用 —— 那样会静默返回
 * undefined，然后抛「useToast must be used within ToastProvider」，
 * 整个应用白屏（App / Toolbar / ImageUploader / ExportDialog / BatchView
 * 全都调用了 useToast）。现在彻底不走 context，从根上避免这类问题。
 *
 * 对象是模块级单例，不依赖任何 hook 的渲染时序，
 * 放在 render 外也不违反 React 的 hook 规则。
 * 单独放一个 utils 文件（而不是和组件混在一起）是为了让该文件
 * 只导出非组件，React Fast Refresh 不会因为它告警。
 */
const toastAdapter = {
  /** 通用入口：type 默认 info，duration <= 0 表示不自动消失 */
  toast: (message, { type = 'info', duration = TOAST_DURATION, ...opts } = {}) =>
    sonnerToast(message, {
      type,
      duration: duration > 0 ? duration : undefined,
      ...opts,
    }),

  /** 主动关掉某一条（sonner 返回的 id） */
  dismiss: (id) => sonnerToast.dismiss(id),

  success: (message, options) => sonnerToast(message, { ...options, type: 'success' }),
  error: (message, options) => sonnerToast(message, { ...options, type: 'error' }),
  warning: (message, options) => sonnerToast(message, { ...options, type: 'warning' }),
  info: (message, options) => sonnerToast(message, { ...options, type: 'info' }),
};

export { toastAdapter };
