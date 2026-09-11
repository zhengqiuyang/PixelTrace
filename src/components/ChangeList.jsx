import { useState, useEffect, useRef, useCallback } from 'react';
import { MAX_REGIONS } from '../utils/constants.js';

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

  return (
    <div className="change-list">
      <div className="change-list-header">
        <span className="change-list-title">变更区域 ({regions.length})</span>
        {truncated && (
          <span className="change-list-truncated">
            仅显示前 {MAX_REGIONS} 个
          </span>
        )}
      </div>

      <div className="change-list-items" ref={listRef}>
        {regionsWithThumbs.map((r) => (
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
            </div>
          </div>
        ))}
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
        </div>
      )}
    </div>
  );
}
