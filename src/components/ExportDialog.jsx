import { useEffect, useRef, useState } from 'react';
import { useToast } from '../hooks/useToast.js';
import { EXPORT_DEFAULTS, EXPORT_QUALITY_MIN, EXPORT_QUALITY_MAX } from '../utils/constants.js';
import {
  EXPORT_KINDS,
  EXPORT_FORMATS,
  getFormat,
  kindProducesImage,
  kindSupportsMarkers,
  runExport,
} from '../utils/exporters.js';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

/**
 * 导出面板 (PRODUCT.md §10.1 / §10.2)
 *
 * 原生 <dialog> + showModal()，与 Dialog / SettingsPanel / SizeMismatchDialog
 * 同一套弹窗机制。
 *
 * 选项之间是有依赖的，面板按依赖动态显隐，不摆无效控件：
 *   · CSV       —— 纯文本，格式 / 质量 / 水印 / 区域标记全部无关，整块隐藏
 *   · HTML 报告 —— 自包含单文件，格式 / 质量对它无意义（内嵌图由报告自己决定），
 *                  只保留「区域边框 / 编号」两个开关
 *   · 当前视图  —— 所见即所得，屏幕上已经画好了框，区域标记无意义，隐藏
 *   · 仅 PNG    —— 无损，质量滑块隐藏（PNG 忽略该参数）
 *   · 差异报告  —— 固定 PNG + JSON，格式选择锁死并置灰
 *
 * 选项是「这一次导出」的参数，不写回全局 settings —— 用户这次导 JPEG，
 * 不代表他下次也想导 JPEG。因此放在 ExportPanel 的本地 state 里：
 * 面板关闭即卸载，state 随之消失，下次打开自动回到默认值，
 * 不需要额外的 effect 去重置（那样反而会触发 set-state-in-effect 告警）。
 */

function OptionList({ value, options, onChange, ariaLabel }) {
  return (
    <div className="export-options" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          className={`export-option ${value === o.key ? 'active' : ''}`}
          onClick={() => onChange(o.key)}
        >
          <span className="export-option-label">{o.label}</span>
          <span className="export-option-hint">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

function Segmented({ value, options, onChange, ariaLabel }) {
  return (
    <div className="export-segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`export-segment ${value === o.key ? 'active' : ''}`}
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="export-row">
      <div className="export-row-label">
        <span>{label}</span>
        {hint && <span className="export-row-hint">{hint}</span>}
      </div>
      <div className="export-row-control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, ariaLabel, disabled = false }) {
  return (
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      aria-label={ariaLabel}
      id={ariaLabel}
    />
  );
}

function ExportPanel({ exportRef, onClose }) {
  const [opts, setOpts] = useState(EXPORT_DEFAULTS);
  const [busy, setBusy] = useState(false);
  const { success: toastSuccess, error: toastError } = useToast();

  const set = (patch) => setOpts((prev) => ({ ...prev, ...patch }));

  const isCsv = opts.kind === 'csv';
  const isHtml = opts.kind === 'html';
  const formatLocked = opts.kind === 'report';
  const producesImage = kindProducesImage(opts.kind);
  const supportsMarkers = kindSupportsMarkers(opts.kind);

  const effectiveFormat = formatLocked ? 'png' : opts.format;
  const effectiveFmt = getFormat(effectiveFormat);
  const showQuality = producesImage && effectiveFmt.lossy && !formatLocked;
  const markersOn = supportsMarkers && opts.withMarkers;

  const handleExport = async () => {
    if (busy) return;
    const payload = exportRef?.current;
    if (!payload) {
      toastError('当前视图暂无可导出的内容');
      return;
    }

    setBusy(true);
    try {
      const result = await runExport(payload, {
        ...opts,
        format: effectiveFormat,
        withMarkers: markersOn,
        withRegionNumbers: markersOn && opts.withRegionNumbers,
      });

      if (!result.ok) {
        toastError(result.error ?? '导出失败，请重试');
        return;
      }
      const n = result.files?.length ?? 1;
      toastSuccess(n > 1 ? `已导出 ${n} 个文件` : '已导出');
      onClose?.();
    } catch (err) {
      console.error('导出失败:', err);
      toastError('导出失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="export-body">
        <section className="export-section">
          <h4 className="export-section-title">导出内容</h4>
          <OptionList
            value={opts.kind}
            options={EXPORT_KINDS}
            onChange={(v) => set({ kind: v })}
            ariaLabel="导出内容"
          />
        </section>

        {isCsv ? (
          <p className="export-note">
            导出全部变更区域的编号、坐标、尺寸与占比，含统计汇总行。
            文件带 BOM，Excel 直接打开中文表头不乱码。
          </p>
        ) : isHtml ? (
          <section className="export-section">
            <h4 className="export-section-title">报告内容</h4>
            <p className="export-note">
              一个自包含的 <code>.html</code> 文件：三联图（原始 / 修改后 / 差异）、
              结论与质量指标、检测参数快照、逐区域明细。
              图片全部内联，无外部依赖 —— 可以直接转发、断网打开、打印成 PDF。
            </p>
            {supportsMarkers && (
              <>
                <Row label="绘制区域边框" hint="在报告的差异图上标出变更区域">
                  <Toggle
                    checked={opts.withMarkers}
                    onChange={(v) => set({ withMarkers: v })}
                    ariaLabel="绘制区域边框"
                  />
                </Row>
                <Row label="显示区域编号">
                  <Toggle
                    checked={opts.withRegionNumbers}
                    disabled={!markersOn}
                    onChange={(v) => set({ withRegionNumbers: v })}
                    ariaLabel="显示区域编号"
                  />
                </Row>
              </>
            )}
          </section>
        ) : (
          <section className="export-section">
            <h4 className="export-section-title">图片选项</h4>

            <Row
              label="格式"
              hint={formatLocked ? '差异报告固定为 PNG + JSON' : undefined}
            >
              <div className={formatLocked ? 'export-locked' : ''}>
                <Segmented
                  value={effectiveFormat}
                  options={EXPORT_FORMATS}
                  onChange={(v) => set({ format: v })}
                  ariaLabel="导出格式"
                />
              </div>
            </Row>

            {showQuality && (
              <Row label="质量" hint="仅 JPEG / WebP 有效">
                <div className="export-slider">
                  <Slider
                    min={EXPORT_QUALITY_MIN}
                    max={EXPORT_QUALITY_MAX}
                    value={[opts.quality]}
                    onValueChange={([v]) => set({ quality: v })}
                    aria-label="导出质量"
                    className="settings-slider-input"
                  />
                  <span className="export-slider-value">{opts.quality}%</span>
                </div>
              </Row>
            )}

            {supportsMarkers && (
              <>
                <Row label="绘制区域边框" hint="在导出图上标出变更区域">
                  <Toggle
                    checked={opts.withMarkers}
                    onChange={(v) => set({ withMarkers: v })}
                    ariaLabel="绘制区域边框"
                  />
                </Row>
                <Row label="显示区域编号">
                  <Toggle
                    checked={opts.withRegionNumbers}
                    disabled={!markersOn}
                    onChange={(v) => set({ withRegionNumbers: v })}
                    ariaLabel="显示区域编号"
                  />
                </Row>
              </>
            )}

            <Row label="添加水印" hint="右下角标注 PixelTrace 与导出时间">
              <Toggle
                checked={opts.watermark}
                onChange={(v) => set({ watermark: v })}
                ariaLabel="添加水印"
              />
            </Row>
          </section>
        )}
      </div>

      <div className="dialog-actions">
        <Button variant="outline" size="sm" onClick={() => onClose?.()} disabled={busy}>
          取消
        </Button>
        <Button variant="accent" size="sm" onClick={handleExport} disabled={busy}>
          {busy ? '导出中...' : '导出'}
        </Button>
      </div>
    </>
  );
}

export default function ExportDialog({ open, onClose, exportRef }) {
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
      className="pixel-dialog export-dialog"
      onClose={() => onClose?.()}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose?.();
      }}
      aria-label="导出"
    >
      <div className="dialog-header">
        <span className="dialog-icon">↓</span>
        <h3 className="dialog-title">导出</h3>
      </div>

      {/* 只在打开时挂载：关闭即卸载，选项自动回到默认值 */}
      <ExportPanel exportRef={exportRef} onClose={onClose} />
    </dialog>
  );
}
