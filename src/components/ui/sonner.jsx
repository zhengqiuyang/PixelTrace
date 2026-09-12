import { Toaster as Sonner } from 'sonner'

/**
 * Sonner Toaster 配置 —— 像素/复古风格
 *
 * 放在 App.jsx 里一次挂载，全局调用 toast('消息') 即可。
 * 自动跟随主题切换（通过 `theme` 属性监听 data-theme 变化）。
 */
const Toaster = ({ ...props }) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      position="top-right"
      richColors
      closeButton
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:border group-[.toaster]:bg-bg-card group-[.toaster]:text-text group-[.toaster]:shadow-panel-lg group-[.toaster]:border-border',
          title: 'font-ui text-sm font-medium',
          description: 'text-sm text-text-dim',
          actionButton:
            'group-[.toast]:bg-accent group-[.toast]:text-on-accent font-ui font-medium',
          cancelButton:
            'group-[.toast]:bg-bg-hover group-[.toast]:text-text-dim font-ui',
          icon: 'text-accent',
          error: 'border-danger/50',
          success: 'border-accent/50',
          warning: 'border-warn/50',
          info: 'border-info/50',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }