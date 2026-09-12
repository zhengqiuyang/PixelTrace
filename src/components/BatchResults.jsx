import { useMemo, useState } from 'react';
import {
  STATUS, STATUS_LABEL, FILTERS, SORTS, applyFilterSort,
} from '../utils/batchResults.js';
import { MATCH_KIND_LABEL } from '../utils/batchPairing.js';

/**
 * 批量结果表。
 *
 * 行本身可点：点击把这一对载入单对对比视图深看。
 * 这是批量与单对两条链路的接缝 —— 批量负责「找出哪几张变了」，
 * 单对负责「具体哪里变了」，缺了这条接缝批量就只能给结论不能给证据。
 */

function Thumbs({ row }) {
  const cells = [];
  if (row.thumbA) cells.push({ src: row.thumbA, cap: '原始' });
  if (row.thumbB) cells.push({ src: row.thumbB, cap: '修改后' });
  if (row.thumbDiff) cells.push({ src: row.thumbDiff, cap: '差异' });
  if (cells.length === 0) return <span className="batch-dim">—</span>;

  return (
    <div className="batch-thumbs">
      {cells.map((c) => (
        <figure className="batch-thumb" key={c.cap}>
          <img src={c.src} alt={c.cap} loading="lazy" />
          <figcaption>{c.cap}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function FileCell({ row }) {
  if (row.kind !== 'pair') {
    const rel = row.relA ?? row.relB;
    return (
      <>
        <div className="batch-path">{rel}</div>
        <div className="batch-tags">
          <span className="batch-tag">
            {row.kind === 'only-a' ? '原始侧独有' : '修改后侧独有'}
          </span>
        </div>
      </>
    );
  }

  const samePath = row.relA === row.relB;
  return (
    <>
      <div className="batch-path">{row.relA}</div>
      {!samePath && <div className="batch-path batch-path--sub">↔ {row.relB}</div>}
      {(row.matchKind !== 'path' || row.sizeMismatch) && (
        <div className="batch-tags">
          {row.matchKind && row.matchKind !== 'path' && (
            <span className="batch-tag batch-tag--loose">
              {MATCH_KIND_LABEL[row.matchKind]}
            </span>
          )}
          {row.sizeMismatch && row.sizeA && row.sizeB && (
            <span className="batch-tag batch-tag--warn">
              尺寸不同 {row.sizeA.width}×{row.sizeA.height} / {row.sizeB.width}×{row.sizeB.height}
            </span>
          )}
        </div>
      )}
    </>
  );
}

export default function BatchResults({
  rows, summary, running, onOpenPair, onExportReport, onExportCsv,
}) {
  const [filterKey, setFilterKey] = useState('attention');
  const [sortKey, setSortKey] = useState('severity');

  const visible = useMemo(
    () => applyFilterSort(rows, filterKey, sortKey),
    [rows, filterKey, sortKey]
  );

  const filterCounts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter(f.test).length])),
    [rows]
  );

  return (
    <div className="batch-results">
      <div className="batch-cards">
        <div className="batch-card">
          <b>{summary.compared}</b><span>对比对数</span>
        </div>
        <div className="batch-card ok">
          <b>{summary.identical}</b><span>一致</span>
        </div>
        <div className="batch-card warn">
          <b>{summary.changed}</b><span>有差异</span>
        </div>
        <div className="batch-card dim">
          <b>{summary.noise}</b><span>微差</span>
        </div>
        <div className="batch-card info">
          <b>{summary.onlyA} / {summary.onlyB}</b><span>仅原始 / 仅修改后有</span>
        </div>
        <div className="batch-card err">
          <b>{summary.error}</b><span>计算失败</span>
        </div>
        {summary.pending > 0 && (
          <div className="batch-card dim">
            <b>{summary.pending}</b><span>待计算</span>
          </div>
        )}
      </div>

      <div className="batch-bar">
        <div className="batch-filters" role="group" aria-label="按状态筛选">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`batch-filter ${filterKey === f.key ? 'active' : ''}`}
              aria-pressed={filterKey === f.key}
              onClick={() => setFilterKey(f.key)}
            >
              {f.label} <i>{filterCounts[f.key] ?? 0}</i>
            </button>
          ))}
        </div>

        <div className="batch-bar-right">
          <select
            className="batch-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            aria-label="排序方式"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>

          <button
            type="button"
            className="pixel-btn"
            onClick={onExportCsv}
            disabled={running || rows.length === 0}
          >
            导出 CSV
          </button>
          <button
            type="button"
            className="pixel-btn accent"
            onClick={onExportReport}
            disabled={running || rows.length === 0}
          >
            导出 HTML 报告 ↓
          </button>
        </div>
      </div>

      <div className="batch-table-wrap">
        <table className="batch-table">
          <thead>
            <tr>
              <th>状态</th>
              <th>文件</th>
              <th>缩略图</th>
              <th className="batch-num">差异像素</th>
              <th className="batch-num">占比</th>
              <th className="batch-num">区域</th>
              <th className="batch-num">最大 ΔE</th>
              <th className="batch-num">SSIM</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const clickable = row.kind === 'pair' && row.status !== STATUS.PENDING;
              return (
                <tr
                  key={row.key}
                  className={`batch-row ${clickable ? 'clickable' : ''}`}
                  onClick={clickable ? () => onOpenPair?.(row) : undefined}
                  title={clickable ? '在单对对比视图里打开这一对' : undefined}
                >
                  <td>
                    <span className={`batch-badge b--${row.status}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="batch-cell-file"><FileCell row={row} /></td>
                  <td><Thumbs row={row} /></td>
                  <td className="batch-num">
                    {typeof row.diffCount === 'number' ? row.diffCount.toLocaleString() : '—'}
                  </td>
                  <td className="batch-num">
                    {typeof row.diffPercentage === 'number'
                      ? `${row.diffPercentage.toFixed(3)}%`
                      : '—'}
                  </td>
                  <td className="batch-num">
                    {typeof row.regionCount === 'number' ? row.regionCount : '—'}
                  </td>
                  <td className="batch-num">
                    {typeof row.maxDeltaE === 'number' ? row.maxDeltaE.toFixed(1) : '—'}
                  </td>
                  <td className="batch-num">
                    {typeof row.ssim === 'number' ? row.ssim.toFixed(4) : '—'}
                  </td>
                  <td className="batch-cell-action">
                    {clickable && <span className="batch-open">查看 →</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <p className="batch-empty">
            {rows.length === 0
              ? '还没有结果'
              : '当前筛选条件下没有文件'}
          </p>
        )}
      </div>
    </div>
  );
}
