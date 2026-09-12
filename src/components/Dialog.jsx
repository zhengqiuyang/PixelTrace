import {
  Dialog as DialogPrimitive,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Dialog 组件 — 模态弹窗
 *
 * 基于 shadcn/ui Dialog（@radix-ui/react-dialog）重构，
 * 保留与现有 .pixel-dialog / .dialog-header / .dialog-actions 相同的视觉。
 *
 * @param {{ open, title, message, actions: Array<{ label, variant?, onClick }>, onClose }} props
 */
export default function Dialog({ open, title, message, actions = [], onClose }) {
  return (
    <DialogPrimitive open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="pixel-dialog max-w-md" aria-label={title}>
        <DialogHeader>
          <div className="dialog-header">
            <span className="dialog-icon">⚠</span>
            <DialogTitle className="dialog-title">{title}</DialogTitle>
          </div>
        </DialogHeader>

        {message && (
          <DialogDescription className="dialog-message">{message}</DialogDescription>
        )}

        <DialogFooter>
          {actions.map((a, i) => (
            <Button
              key={i}
              variant={a.variant === 'primary' ? 'accent' : 'outline'}
              size="sm"
              onClick={() => {
                a.onClick?.();
                onClose?.();
              }}
            >
              {a.label}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </DialogPrimitive>
  );
}