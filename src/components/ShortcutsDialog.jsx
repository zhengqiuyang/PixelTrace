import { useEffect, useRef } from 'react';

/**
 * 快捷键帮助面板 (PRODUCT.md §11.2)
 *
 * 原生 <dialog> + showModal()，与其它弹窗同一套机制。
 * 表里只列「真的能用」的快捷键 —— 上一版 ? 只弹一条 toast，
 * 而 toast 里那串文案和实际 handler 早就对不上了。
 */
const GROUPS = [
  {
    title: '视图切换',
    items: [
      ['1 ~ 6', '切换六种比较视图'],
    ],
  },
  {
    title: '缩放与平移',
    items: [
      ['+ / -', '放大 / 缩小'],
      ['0', '适应窗口'],
      ['Ctrl+0', '重置为 100%'],
      ['滚轮', '以光标为中心缩放'],
      ['双击画布', '100% ⇄ 适应窗口'],
      ['↑ ↓ ← →', '平移画布'],
      ['Space (按住)', '临时拖拽平移'],
    ],
  },
  {
    title: '操作',
    items: [
      ['Ctrl+C', '复制当前视图到剪贴板'],
      ['Ctrl+E / E', '快速导出当前视图为 PNG'],
      ['Ctrl+S', '快速导出当前视图为 PNG'],
      ['Ctrl+Shift+E', '打开导出面板（可选格式 / 质量 / 水印）'],
      ['F', '全屏切换'],
      [',', '打开设置面板'],
      ['?', '本面板'],
      ['Esc', '关闭弹窗 / 退出全屏'],
    ],
  },
];

export default function ShortcutsDialog({ open, onClose }) {
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
      className="pixel-dialog shortcuts-dialog"
      onClose={() => onClose?.()}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose?.();
      }}
      aria-label="键盘快捷键"
    >
      <div className="dialog-header">
        <span className="dialog-icon">⌨</span>
        <h3 className="dialog-title">键盘快捷键</h3>
      </div>

      <div className="shortcuts-body">
        {GROUPS.map((g) => (
          <section key={g.title} className="shortcuts-group">
            <h4 className="shortcuts-group-title">{g.title}</h4>
            <table className="shortcuts-table">
              <tbody>
                {g.items.map(([keys, desc]) => (
                  <tr key={keys}>
                    <td className="shortcuts-keys">
                      <kbd>{keys}</kbd>
                    </td>
                    <td className="shortcuts-desc">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <div className="dialog-actions">
        <button className="pixel-btn accent" onClick={() => onClose?.()}>
          知道了
        </button>
      </div>
    </dialog>
  );
}
