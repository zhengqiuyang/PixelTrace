import { useEffect, useState } from 'react'
import { Toaster as Sonner } from 'sonner'

/**
 * 读 <html data-theme>，转成 sonner 认识的 'light' | 'dark'。
 *
 * 不能用 theme="system"：那跟的是操作系统的 prefers-color-scheme，
 * 用户在页面上点右上角主题开关时 sonner 根本不会跟着变。
 * 我们自己的主题状态就在 data-theme 上（见 utils/theme.js），
 * 直接监听它最准，也不依赖任何 React context 的层级。
 *
 * MutationObserver 只盯一个属性，成本可忽略；
 * 不监听全局 click 或轮询 DOM。
 */
function useAppTheme() {
  const [theme, setTheme] = useState(() =>
    typeof document === 'undefined' ? 'dark' : (document.documentElement.dataset.theme || 'dark')
  )

  useEffect(() => {
    const el = document.documentElement
    const sync = () => setTheme(el.dataset.theme || 'dark')
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

/**
 * Sonner Toaster 配置 —— 像素/复古风格
 *
 * 放在 App.jsx 里一次挂载，全局调用 toast('消息') 即可。
 * theme 由上面的 useAppTheme() 跟随项目自身的 data-theme 切换。
 */
const Toaster = ({ ...props }) => {
  const theme = useAppTheme()
  return (
    <Sonner
      theme={theme}
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
