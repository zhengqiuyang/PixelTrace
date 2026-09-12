/**
 * 批量对比报告 —— 生成一份**自包含**的 HTML。
 *
 * 「自包含」是硬要求：所有缩略图都是内嵌的 data URL，字体用系统字体栈，
 * 没有任何外链。这样报告可以直接发给别人、丢进归档、断网打开，
 * 都不会出现「图片裂了 / 样式没了」。代价是文件偏大（几十张约 1MB 量级）。
 *
 * 报告里同时写下当时的检测口径（阈值 / 最小区域 / 合并距离 / 比较口径），
 * 否则一份「9 张有差异」的报告过两周就没人说得清是按什么标准判的。
 *
 * 共享的样式与工具（转义 / 卡片 / 表格 / 徽章 / 打印规则）在 reportShell.js，
 * 单图报告（pairReport.js）用的是同一套 —— 两边各写一份的话观感很快会分叉。
 */

import { STATUS_LABEL, FILTERS, SORTS } from './batchResults.js';
import { MATCH_KIND_LABEL } from './batchPairing.js';
import { DIFF_MODES } from './constants.js';
import {
  esc, num, stamp, compactStamp, cardsHtml, reportPage,
} from './reportShell.js';

function diffModeLabel(key) {
  return DIFF_MODES.find((m) => m.key === key)?.label ?? key;
}

/**
 * 三联缩略图：原始 / 修改后 / 差异
 *
 * 不加 loading="lazy"：报告是自包含的静态快照（图片是内联 data URL，没有网络请求，
 * 延迟加载省不下任何传输），而它注定要被打印成 PDF / 分享出去 ——
 * 一旦浏览器打印时折叠区外的懒图还没解码，导出的 PDF 上就是一片空白。
 * 实测 headless Chrome 下 20 张里就有 7 张始终没解码，这不是理论风险。
 * 几十张规模下直接全解码的代价可以忽略。
 */
function thumbsCell(row) {
  const cell = (src, caption) => (src
    ? `<figure class="th"><img src="${src}" alt="${esc(caption)}"><figcaption>${esc(caption)}</figcaption></figure>`
    : '<figure class="th th--empty"><figcaption>无</figcaption></figure>');

  const a = row.thumbA ? cell(row.thumbA, '原始') : '';
  const b = row.thumbB ? cell(row.thumbB, '修改后') : '';
  const d = row.thumbDiff ? cell(row.thumbDiff, '差异') : '';

  if (!a && !b && !d) return '<span class="dim">—</span>';
  return `<div class="ths">${a}${b}${d}</div>`;
}

function fileCell(row) {
  if (row.kind === 'pair') {
    const same = row.relA === row.relB;
    const match = row.matchKind && row.matchKind !== 'path'
      ? `<span class="tag tag--loose">${esc(MATCH_KIND_LABEL[row.matchKind])}</span>`
      : '';
    const size = row.sizeMismatch && row.sizeA && row.sizeB
      ? `<span class="tag tag--warn">尺寸不同 ${row.sizeA.width}×${row.sizeA.height} / ${row.sizeB.width}×${row.sizeB.height}</span>`
      : '';
    return `<div class="path">${esc(row.relA)}</div>`
      + (same ? '' : `<div class="path path--sub">↔ ${esc(row.relB)}</div>`)
      + (match || size ? `<div class="tags">${match}${size}</div>` : '');
  }
  const rel = row.relA ?? row.relB;
  const side = row.kind === 'only-a' ? '原始侧独有' : '修改后侧独有';
  return `<div class="path">${esc(rel)}</div><div class="tags"><span class="tag">${side}</span></div>`;
}

function rowHtml(row) {
  const isPair = row.kind === 'pair';
  return `<tr data-s="${row.status}" data-d="${row.diffPercentage ?? -1}" data-e="${row.maxDeltaE ?? -1}" data-p="${esc((row.relA ?? row.relB).toLowerCase())}">`
    + `<td><span class="badge b--${row.status}">${esc(STATUS_LABEL[row.status])}</span></td>`
    + `<td class="c-file">${fileCell(row)}</td>`
    + `<td>${thumbsCell(row)}</td>`
    + `<td class="c-num">${isPair ? num(row.diffCount) : '—'}</td>`
    + `<td class="c-num">${isPair && typeof row.diffPercentage === 'number' ? `${row.diffPercentage.toFixed(3)}%` : '—'}</td>`
    + `<td class="c-num">${isPair ? num(row.regionCount) : '—'}</td>`
    + `<td class="c-num">${isPair ? num(row.maxDeltaE, 1) : '—'}</td>`
    + `<td class="c-num">${isPair ? num(row.ssim, 4) : '—'}</td>`
    + `<td class="c-num">${isPair && row.width ? `${row.width}×${row.height}` : '—'}</td>`
    + '</tr>';
}

/** 筛选 / 排序的行内脚本（纯 vanilla，不依赖任何库） */
const REPORT_SCRIPT = `(function () {
  var tbody = document.getElementById('rows');
  var all = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
  var empty = document.getElementById('empty');
  var current = 'attention';

  var TESTS = {
    attention: function (s) { return s === 'changed'; },
    changed: function (s) { return s === 'changed' || s === 'noise'; },
    only: function (s) { return s === 'only-a' || s === 'only-b'; },
    error: function (s) { return s === 'error'; },
    all: function () { return true; }
  };

  function numAttr(tr, name) {
    var v = parseFloat(tr.getAttribute(name));
    return isNaN(v) ? -1 : v;
  }

  function apply() {
    var test = TESTS[current] || TESTS.all;
    var shown = 0;
    for (var i = 0; i < all.length; i++) {
      var tr = all[i];
      var ok = test(tr.getAttribute('data-s'));
      tr.hidden = !ok;
      if (ok) shown++;
    }
    empty.hidden = shown !== 0;
  }

  function sortBy(key) {
    var cmp;
    if (key === 'diff-desc') cmp = function (a, b) { return numAttr(b, 'data-d') - numAttr(a, 'data-d'); };
    else if (key === 'diff-asc') cmp = function (a, b) { return numAttr(a, 'data-d') - numAttr(b, 'data-d'); };
    else if (key === 'deltae-desc') cmp = function (a, b) { return numAttr(b, 'data-e') - numAttr(a, 'data-e'); };
    else if (key === 'path') cmp = function (a, b) {
      return (a.getAttribute('data-p') || '').localeCompare(b.getAttribute('data-p') || '');
    };
    else cmp = null;

    var list = all.slice();
    if (cmp) list.sort(cmp);
    for (var i = 0; i < list.length; i++) tbody.appendChild(list[i]);
    apply();
  }

  var btns = document.querySelectorAll('.filters button');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function (e) {
      for (var j = 0; j < btns.length; j++) btns[j].classList.remove('on');
      e.currentTarget.classList.add('on');
      current = e.currentTarget.getAttribute('data-filter');
      apply();
    });
  }

  document.getElementById('sort').addEventListener('change', function (e) {
    sortBy(e.target.value);
  });

  apply();
})();`;

/** 批量报告独有的样式：筛选条与排序下拉 */
const EXTRA_CSS = `
  .bar { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;
         margin:24px 0 12px; }
  .filters { display:flex; flex-wrap:wrap; gap:6px; }
  .filters button { background:var(--card); border:1px solid var(--line); color:var(--dim);
                    border-radius:5px; padding:6px 12px; font-size:13px; cursor:pointer; font-family:inherit; }
  .filters button:hover { color:var(--fg); }
  .filters button.on { background:var(--ok); border-color:var(--ok); color:#08110c; font-weight:600; }
  .filters i { font-style:normal; opacity:.7; }
  select { background:var(--card); border:1px solid var(--line); color:var(--fg);
           border-radius:5px; padding:6px 10px; font-size:13px; font-family:inherit; }
`;

/**
 * @param {object} o
 * @param {Array} o.rows buildRows() 的输出（完整列表，未筛选）
 * @param {object} o.summary summarize() 的输出
 * @param {object} o.settings 当时的检测设置
 * @param {object} [o.meta] { labelA, labelB, ambiguous, ignoredCount }
 * @returns {string} 完整的 HTML 文档
 */
export function buildBatchReportHtml({ rows, summary, settings, meta = {} }) {
  const generatedAt = stamp();

  const cards = cardsHtml([
    ['', summary.compared, '对比对数'],
    ['ok', summary.identical, '一致'],
    ['warn', summary.changed, '有差异'],
    ['dim', summary.noise, '微差（未构成区域）'],
    ['info', `${summary.onlyA} / ${summary.onlyB}`, '仅原始 / 仅修改后有'],
    ['err', summary.error, '计算失败'],
  ]);

  const filterBtns = FILTERS.map((f) => {
    const n = rows.filter(f.test).length;
    return `<button type="button" data-filter="${f.key}" class="${f.key === 'attention' ? 'on' : ''}">`
      + `${esc(f.label)} <i>${n}</i></button>`;
  }).join('');

  const sortOpts = SORTS.map((s) => `<option value="${s.key}">${esc(s.label)}</option>`).join('');

  const ambiguousBlock = (meta.ambiguous?.length)
    ? `<section class="notice">
        <h3>配对歧义（${meta.ambiguous.length} 组）</h3>
        <p>以下文件在同一侧存在多个同名候选，无法确定该与哪一个配对。
           为避免给出错误的对比结论，这些文件<strong>未被配对</strong>，
           已计入「仅单边有」。请调整目录结构后重新对比。</p>
        <ul>${meta.ambiguous.map((a) => (
          `<li><code>${esc(a.key)}</code> — 原始侧 ${a.relA.length} 个候选，修改后侧 ${a.relB.length} 个</li>`
        )).join('')}</ul>
      </section>`
    : '';

  const ignoredNote = meta.ignoredCount
    ? `<p class="meta-sub">已忽略 ${meta.ignoredCount} 个非图片文件</p>`
    : '';

  const headerHtml = `  <h1>批量对比报告</h1>
  <p class="meta">
    生成于 ${esc(generatedAt)} ·
    检测口径 阈值 ${esc(settings?.threshold)} / 最小区域 ${esc(settings?.minArea)}px /
    合并距离 ${esc(settings?.mergeDistance)}px / ${esc(diffModeLabel(settings?.diffMode))}
    ${settings?.ignoreShift ? ` / 忽略位移 ±${esc(settings.ignoreShift)}px` : ''}
    ${settings?.antiAlias ? ' / 抗锯齿过滤' : ''}
  </p>
  ${meta.labelA || meta.labelB ? `<p class="meta">原始：${esc(meta.labelA ?? '—')} · 修改后：${esc(meta.labelB ?? '—')}</p>` : ''}
  ${ignoredNote}`;

  const bodyHtml = `<div class="cards">${cards}</div>

${ambiguousBlock}

<div class="bar">
  <div class="filters">${filterBtns}</div>
  <select id="sort" aria-label="排序方式">${sortOpts}</select>
</div>

<table>
  <thead>
    <tr>
      <th>状态</th><th>文件</th><th>缩略图（原始 / 修改后 / 差异）</th>
      <th class="c-num">差异像素</th><th class="c-num">占比</th><th class="c-num">区域</th>
      <th class="c-num">最大 ΔE</th><th class="c-num">SSIM</th><th class="c-num">尺寸</th>
    </tr>
  </thead>
  <tbody id="rows">
    ${rows.map(rowHtml).join('\n    ')}
  </tbody>
</table>

<p class="empty" id="empty" hidden>当前筛选条件下没有文件</p>`;

  return reportPage({
    title: `PixelTrace 批量对比报告 — ${generatedAt}`,
    headerHtml,
    bodyHtml,
    extraCss: EXTRA_CSS,
    script: REPORT_SCRIPT,
  });
}

/** 供 UI 直接下载 */
export function buildBatchReportFilename(label, ext = 'html') {
  return `pixeltrace_batch_${label || 'report'}_${compactStamp()}.${ext}`;
}

/** 汇总 CSV（表格数据，便于再加工） */
export function buildBatchCsv(rows) {
  const header = ['状态', '原始路径', '修改后路径', '配对依据', '差异像素', '差异占比(%)', '区域数', '最大ΔE', '平均ΔE', 'MSE', 'PSNR', 'SSIM', '宽', '高', '尺寸不同'];
  const body = rows.map((r) => [
    STATUS_LABEL[r.status],
    r.relA ?? '',
    r.relB ?? '',
    r.matchKind ? (MATCH_KIND_LABEL[r.matchKind] ?? r.matchKind) : '',
    r.diffCount ?? '',
    typeof r.diffPercentage === 'number' ? r.diffPercentage.toFixed(4) : '',
    r.regionCount ?? '',
    typeof r.maxDeltaE === 'number' ? r.maxDeltaE.toFixed(2) : '',
    typeof r.meanDeltaE === 'number' ? r.meanDeltaE.toFixed(2) : '',
    typeof r.mse === 'number' ? r.mse.toFixed(4) : '',
    typeof r.psnr === 'number' && Number.isFinite(r.psnr) ? r.psnr.toFixed(4) : '',
    typeof r.ssim === 'number' ? r.ssim.toFixed(6) : '',
    r.width ?? '',
    r.height ?? '',
    r.sizeMismatch ? '是' : '',
  ]);

  const csv = [header, ...body]
    .map((cols) => cols.map((c) => {
      const s = String(c ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n');

  // BOM：否则 Excel 打开中文表头乱码
  return `\uFEFF${csv}\r\n`;
}
