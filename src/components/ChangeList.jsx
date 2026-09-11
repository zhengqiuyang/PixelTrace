import { useState, useEffect, useRef, useCallback } from 'react';
import { MAX_REGIONS, REGION_SIZE_SPLIT } from '../utils/constants.js';
import { formatPsnr, formatSsim, describeDeltaE } from '../utils/imageMetrics.js';
import HistogramChart from './HistogramChart.jsx';

// ─── 排序与筛选 (§8.4) ──────────────────────────────────
// 只影响列表的展示顺序与可见集合，不改动 region.id ——
// 画布上的区域编号必须保持稳定，否则「#3」在列表和画布上会对不上

const SORT_OPTIONS = [
  { key: 'id', label: '按编号' },
  { key: 'area-desc', label: '面积 大→小' },
  { key: 'area-asc', label: '面积 小→大' },
  { key: 'pos-x', label: '位置 左→右' },
  { key: 'pos-y', label: '位置 上→下' },
];

const FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'large', label: '仅大区域' },
  { key: 'small', label: '仅小区域' },
];

const SORTERS = {
  id: (a, b) => a.id - b.id,
  'area-desc': (a, b) => b.pixels - a.pixels,
  'area-asc': (a, b) => a.pixels - b.pixels,
  'pos-x': (a, b) => a.x - b.x || a.y - b.y,
  'pos-y': (a, b) => a.y - b.y || a.x - b.x,
};

/**
 * 生成区域缩略图 (64×64, Base64)
 * 懒生成: rAF 空闲批处理，每帧最多 10 个
 */
function generateThumbnails(img, regions, setRegionsWithThumbs, cancelRef) {
  if (!img || regions.length === 0) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const THUMB_SIZE = 64;

  const cW = img.naturalWidth || img.width;
  const cH = img.naturalHeight || img.height;

  let idx = 0;

  function processBatch() {
    if (cancelRef.current) return;

    const batchEnd = Math.min(idx + 10, regions.length);

    while (idx < batchEnd && idx < regions.length) {
      if (cancelRef.current) return;
      const r = regions[idx];
      const sx = Math.max(0, r.x);
      const sy = Math.max(0, r.y);
      const sw = Math.min(r.width, cW - sx);
      const sh = Math.min(r.height, cH - sy);

      if (sw > 0 && sh > 0) {
        canvas.width = THUMB_SIZE;
        canvas.height = THUMB_SIZE;
        ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, THUMB_SIZE, THUMB_SIZE);
        r.thumbnail = canvas.toDataURL('image/jpeg', 0.6);
      } else {
        r.thumbnail = '';
      }

      idx++;
    }

    if (idx < regions.length && !cancelRef.current) {
      setRegionsWithThumbs((prev) => [...prev]);
      requestIdleCallback(processBatch, { timeout: 100 });
    } else if (!cancelRef.current) {
      setRegionsWithThumbs((prev) => [...prev]);
    }
  }

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(processBatch, { timeout: 100 });
  } else {
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      const sx = Math.max(0, r.x);
      const sy = Math.max(0, r.y);
      const sw = Math.min(r.width, cW - sx);
      const sh = Math.min(r.height, cH - sy);
      if (sw > 0 && sh > 0) {
        canvas.width = THUMB_SIZE;
        canvas.height = THUMB_SIZE;
        ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, THUMB_SIZE, THUMB_SIZE);
        r.thumbnail = canvas.toDataURL('image/jpeg', 0.6);
      } else {
        r.thumbnail = '';
      }
    }
    setRegionsWithThumbs((prev) => [...prev]);
  }
}

export default function ChangeList({ regions, stats, img2, selectedRegion, onSelectRegion, hoveredRegion, onHoverRegion }) {
  const [regionsWithThumbs, setRegionsWithThumbs] = useState([]);
  const [sortBy, setSortBy] = useState('id');
  const [filterBy, setFilterBy] = useState('all');
  // 直方图默认收起：侧栏空间有限，它是「按需深入」的信息
  const [showHistogram, setShowHistogram] = useState(false);
  const listRef = useRef(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = true;
    const cleaned = regions.map((r) => ({ ...r, thumbnail: '' }));
    setRegionsWithThumbs(cleaned);
    cancelRef.current = false;
    generateThumbnails(img2, cleaned, setRegionsWithThumbs, cancelRef);
    return () => { cancelRef.current = true; };
  }, [regions, img2]);

  const handleClick = useCallback((regionId) => {
    onSelectRegion?.(selectedRegion === regionId ? null : regionId);
  }, [onSelectRegion, selectedRegion]);

  const handleMouseEnter = useCallback((regionId) => {
    onHoverRegion?.(regionId);
  }, [onHoverRegion]);

  const handleMouseLeave = useCallback(() => {
    onHoverRegion?.(null);
  }, [onHoverRegion]);

  const truncated = regions.length >= MAX_REGIONS;

  // ─── 排序 + 筛选 (§8.4) ───
  const threshold = REGION_SIZE_SPLIT;
  const visible = regionsWithThumbs
    .filter((r) => {
      if (filterBy === 'large') return r.pixels >= threshold;
      if (filterBy === 'small') return r.pixels < threshold;
      return true;
    })
    .sort(SORTERS[sortBy] ?? SORTERS.id);

  // §8.5 统计面板要求列出最大/最小区域，按差异像素数取（与 §8.4「面积」口径一致）
  const largest = regions.length
    ? regions.reduce((m, r) => (r.pixels > m.pixels ? r : m))
    : null;
  const smallest = regions.length
    ? regions.reduce((m, r) => (r.pixels < m.pixels ? r : m))
    : null;

  const filtered = visible.length !== regionsWithThumbs.length;

  return (
    <div className="change-list">
      <div className="change-list-header">
        <span className="change-list-title">
          变更区域 ({filtered ? `${visible.length}/${regionsWithThumbs.length}` : regions.length})
        </span>
        {truncated && (
          <span className="change-list-truncated">
            仅显示前 {MAX_REGIONS} 个
          </span>
        )}
      </div>

      <div className="change-list-controls">
        <select
          className="change-list-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="变更区域排序方式"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>

        <div className="change-list-filters" role="group" aria-label="变更区域筛选">
          {FILTER_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`change-list-filter ${filterBy === o.key ? 'active' : ''}`}
              onClick={() => setFilterBy(o.key)}
              aria-pressed={filterBy === o.key}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="change-list-items" ref={listRef}>
        {visible.map((r) => (
          <div
            key={r.id}
            className={`change-list-item ${selectedRegion === r.id ? 'selected' : ''} ${hoveredRegion === r.id ? 'hovered' : ''}`}
            onClick={() => handleClick(r.id)}
            onMouseEnter={() => handleMouseEnter(r.id)}
            onMouseLeave={handleMouseLeave}
          >
            {r.thumbnail ? (
              <img className="change-list-thumb" src={r.thumbnail} alt={`区域 #${r.id}`} />
            ) : (
              <div className="change-list-thumb-placeholder" />
            )}
            <div className="change-list-info">
              <span className="change-list-id">#{r.id}</span>
              <span className="change-list-dims">
                {r.width} × {r.height}
              </span>
              <span className="change-list-pixels">
                {r.pixels.toLocaleString()} px ({r.percentage.toFixed(1)}%)
              </span>
              {r.metrics && (
                <span
                  className="change-list-deltae"
                  title={`平均色差 ΔE76 ${r.metrics.meanDeltaE.toFixed(2)}（${describeDeltaE(r.metrics.meanDeltaE)}）｜最大 ${r.metrics.maxDeltaE.toFixed(2)}｜平均亮度变化 ${r.metrics.meanLumaShift >= 0 ? '+' : ''}${r.metrics.meanLumaShift.toFixed(1)}`}
                >
                  ΔE {r.metrics.meanDeltaE.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        ))}

        {visible.length === 0 && (
          <p className="change-list-empty">
            {regionsWithThumbs.length === 0
              ? '未检测到差异区域'
              : `没有${filterBy === 'large' ? '大' : '小'}于 ${threshold} px 的区域`}
          </p>
        )}
      </div>

      {stats && (
        <div className="change-list-stats">
          <div className="stat-row">
            <span className="stat-label">总像素</span>
            <span className="stat-value">{stats.totalPixels.toLocaleString()}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">差异像素</span>
            <span className="stat-value">{stats.diffCount.toLocaleString()}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">差异占比</span>
            <span className="stat-value stat-accent">
              {stats.diffPercentage.toFixed(2)}%
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">变更区域</span>
            <span className="stat-value">{stats.regionCount}</span>
          </div>
          {largest && (
            <div className="stat-row">
              <span className="stat-label">最大区域</span>
              <span className="stat-value">{largest.width} × {largest.height}</span>
            </div>
          )}
          {smallest && (
            <div className="stat-row">
              <span className="stat-label">最小区域</span>
              <span className="stat-value">{smallest.width} × {smallest.height}</span>
            </div>
          )}

          {stats.metrics && (
            <>
              <div className="stat-section-title">质量指标</div>
              <div className="stat-row">
                <span className="stat-label" title="峰值信噪比，越高越好；无穷大表示两图完全一致">
                  PSNR
                </span>
                <span className="stat-value">{formatPsnr(stats.metrics.psnr)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label" title="结构相似度，1 表示完全一致。按 8×8 分块统计，边缘不足一块的像素不计入">
                  SSIM
                </span>
                <span className="stat-value">{formatSsim(stats.metrics.ssim)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label" title="均方误差，越小越好">
                  MSE
                </span>
                <span className="stat-value">{stats.metrics.mse.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {stats?.metrics?.histogram && (
        <div className="change-list-histogram">
          <button
            type="button"
            className="change-list-histogram-toggle"
            onClick={() => setShowHistogram((v) => !v)}
            aria-expanded={showHistogram}
          >
            <span className="histogram-caret">{showHistogram ? '▾' : '▸'}</span>
            RGB 直方图
          </button>
          {/* 折叠时整个卸载：画布在隐藏状态下量不到宽度，挂载时再量才准 */}
          {showHistogram && <HistogramChart histogram={stats.metrics.histogram} />}
        </div>
      )}
    </div>
  );
}
