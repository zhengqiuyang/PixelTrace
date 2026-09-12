import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const buttonVariants = cva(
  // 基础样式：像素风格按钮 —— 无圆角、硬边框、像素字体
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-ui text-sm font-medium transition-all duration-200 outline-none focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-accent focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // 默认：深色底 + 亮色边框
        default:
          'bg-bg-card text-text border border-border hover:bg-bg-hover hover:border-accent/40 active:bg-bg-hover',
        // 强调色：荧光绿实心底
        accent:
          'bg-accent text-on-accent border border-accent hover:bg-accent-bright hover:border-accent-bright shadow-[0_0_12px_rgba(var(--accent-rgb),0.2)] active:shadow-[0_0_8px_rgba(var(--accent-rgb),0.15)]',
        // 危险：红色实心底
        destructive:
          'bg-danger text-white border border-danger hover:bg-danger-dim hover:border-danger-dim',
        // 幽灵：透明底 + 边框
        outline:
          'bg-transparent text-text border border-border hover:bg-bg-hover hover:border-accent/30',
        // 次要：柔和背景
        secondary:
          'bg-bg-hover text-text border border-border hover:bg-border/40',
        // 链接：无背景无边框
        link:
          'text-accent underline-offset-4 hover:underline',
        // 图标按钮：正方形
        icon:
          'bg-bg-card text-text border border-border h-8 w-8 hover:bg-bg-hover hover:border-accent/40',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6 text-base',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = 'Button'

export { Button, buttonVariants }