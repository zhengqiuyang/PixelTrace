import { useEffect, useRef } from 'react';
import { useAppContext } from '../hooks/useAppContext.js';
import {
  MIN_THRESHOLD, MAX_THRESHOLD,
  MIN_AREA_MIN, MIN_AREA_MAX,
  MERGE_DISTANCE_MIN, MERGE_DISTANCE_MAX,
  ZOOM_STEP_PERCENT_MIN, ZOOM_STEP_PERCENT_MAX,
  HIGHLIGHT_COLORS,
} from '../utils/constants.js';

/**
 * 设置面板 (PRODUCT.md §9.3)
 *
 * 原生 <dialog> + showModal()，与 Dialog / SizeMismatchDialog 同一套弹窗机制。
 * 所有改动即时生效（updateSettings → 触发 useImageDiff 重算 / 画布重绘），
 * 因此不需要「确定」按钮，底部只留「恢复默认」与「完成」。
 *
 * 注意：§9.3 里的「渲染精度 (1x/0.5/0.25)」没有做进来 —— 它需要六个视图
 * 连同差异计算一起改成可变分辨率渲染，属于独立的一块工作，先不放假控件。
 */

/** 一行设置：左侧标签 + 右侧控件 */
function Row({ label, hint, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span>{label}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

/** 滑块 + 数值 */
function Slider({ value, min, max, step = 1, suffix = '', onChange, ariaLabel }) {
  return (
    <div className="settings-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={ariaLabel}
      />
      <span className="settings-slider-value">
        {value}
        {suffix}
      </span>
    </div>
  );
}

/** 开关 */
function Toggle({ checked, onChange, ariaLabel }) {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
      />
      <span className="settings-toggle-track" aria-hidden="true">
        <span className="settings-toggle-thumb" />
      </span>
    </label>
  );
}

export default function SettingsPanel({ open, onClose }) {
  const { state, updateSettings, resetSettings } = useAppContext();
  const { settings } = state;
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

  const set = (patch) => updateSettings(patch);

  return (
    <dialog
      ref={dialogRef}
      className="pixel-dialog settings-dialog"
      onClose={() => onClose?.()}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose?.();
      }}
      aria-label="设置"
    >
      <div className="dialog-header">
        <span className="dialog-icon">≡</span>
        <h3 className="dialog-title">设置</h3>
      </div>

      <div className="settings-body">
        <section className="settings-section">
          <h4 className="settings-section-title">差异检测</h4>
          <Row label="阈值" hint="越大越只保留明显差异">
            <Slider
              value={settings.threshold}
              min={MIN_THRESHOLD}
              max={MAX_THRESHOLD}
              onChange={(v) => set({ threshold: v })}
              ariaLabel="差异阈值"
            />
          </Row>
          <Row label="最小区域面积" hint="小于该面积的差异会被忽略">
            <Slider
              value={settings.minArea}
              min={MIN_AREA_MIN}
              max={MIN_AREA_MAX}
              suffix=" px"
              onChange={(v) => set({ minArea: v })}
              ariaLabel="最小区域面积"
            />
          </Row>
          <Row label="合并距离" hint="距离小于该值的区域会合并">
            <Slider
              value={settings.mergeDistance}
              min={MERGE_DISTANCE_MIN}
              max={MERGE_DISTANCE_MAX}
              suffix=" px"
              onChange={(v) => set({ mergeDistance: v })}
              ariaLabel="区域合并距离"
            />
          </Row>
        </section>

        <section className="settings-section">
          <h4 className="settings-section-title">显示设置</h4>
          <Row label="显示差异区域边框">
            <Toggle
              checked={settings.showDiffBoxes}
              onChange={(v) => set({ showDiffBoxes: v })}
              ariaLabel="显示差异区域边框"
            />
          </Row>
          <Row label="显示区域编号">
            <Toggle
              checked={settings.showRegionNumbers}
              onChange={(v) => set({ showRegionNumbers: v })}
              ariaLabel="显示区域编号"
            />
          </Row>
          <Row label="显示像素网格" hint="网格随缩放自动调整疏密">
            <Toggle
              checked={settings.showGrid}
              onChange={(v) => set({ showGrid: v })}
              ariaLabel="显示像素网格"
            />
          </Row>
          <Row label="显示十字参考线">
            <Toggle
              checked={settings.showCrosshair}
              onChange={(v) => set({ showCrosshair: v })}
              ariaLabel="显示十字参考线"
            />
          </Row>
          <Row label="差异高亮颜色">
            <div className="settings-swatches">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`settings-swatch ${settings.highlightColor === c.value ? 'active' : ''}`}
                  style={{ background: c.value }}
                  title={c.label}
                  aria-label={`高亮颜色 ${c.label}`}
                  aria-pressed={settings.highlightColor === c.value}
                  onClick={() => set({ highlightColor: c.value })}
                />
              ))}
            </div>
          </Row>
        </section>

        <section className="settings-section">
          <h4 className="settings-section-title">缩放与平移</h4>
          <Row label="滚轮缩放速度">
            <Slider
              value={settings.zoomStepPercent}
              min={ZOOM_STEP_PERCENT_MIN}
              max={ZOOM_STEP_PERCENT_MAX}
              suffix=" %"
              onChange={(v) => set({ zoomStepPercent: v })}
              ariaLabel="滚轮缩放速度"
            />
          </Row>
          <Row label="平滑缩放动画">
            <Toggle
              checked={settings.smoothZoom}
              onChange={(v) => set({ smoothZoom: v })}
              ariaLabel="平滑缩放动画"
            />
          </Row>
          <Row label="缩放时显示百分比">
            <Toggle
              checked={settings.showZoomPercent}
              onChange={(v) => set({ showZoomPercent: v })}
              ariaLabel="缩放时显示百分比"
            />
          </Row>
        </section>

        <section className="settings-section">
          <h4 className="settings-section-title">性能</h4>
          <Row label="使用 WebWorker" hint="大图建议开启，关闭后改为主线程计算">
            <Toggle
              checked={settings.useWorker}
              onChange={(v) => set({ useWorker: v })}
              ariaLabel="使用 WebWorker"
            />
          </Row>
        </section>
      </div>

      <div className="dialog-actions">
        <button className="pixel-btn" onClick={() => resetSettings()}>
          恢复默认
        </button>
        <button className="pixel-btn accent" onClick={() => onClose?.()}>
          完成
        </button>
      </div>
    </dialog>
  );
}
