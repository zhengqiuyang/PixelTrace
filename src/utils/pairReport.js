/**
 * 单图差异报告 —— 生成一份**自包含**的 HTML。
 *
 * 与批量报告（batchReport.js）共用 reportShell.js 里的样式与工具，
 * 区别在于它描述的是「这一对图的差异」，所以内容更细：
 *   · 三联图（原始 / 修改后 / 差异）按原图比例嵌入
 *   · 结论横幅 —— 一屏之内先给判断，再给证据
 *   · 全量质量指标（ΔE / MSE / PSNR / SSIM）
 *   · 检测参数快照 + 两张图的文件信息
 *   · 逐区域明细（位置 / 尺寸 / 像素数 / ΔE / 亮度偏移）
 *
 * 三档结论复用 batchResults 的 classifyPair —— 单图报告和批量报告
 * 必须对同一份差异给出同一个判断，各写一套判定迟早会分叉。
 *
 * 本模块是纯字符串拼接，不碰 DOM，因此可以在 Node 里直接单测。
 */

import { classifyPair, STATUS, STATUS_LABEL } from './batchResults.js';
import { DIFF_MODES } from './constants.js';
import { summarizeDeltaE } from './imageMetrics.js';
import {
  esc, num, stamp, compactStamp, cardsHtml, paramsHtml, reportPage,
} from './reportShell.js';

function diffModeLabel(key) {
  return DIFF_MODES.find((m) => m.key === key)?.label ?? key;
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 一行「标签 / 值」，文件信息用 */
function kvRow(label, value) {
  return value ? `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>` : '';
}

/** 结论横幅 —— 报告最重要的一句话，放在最上面 */
function verdictHtml(status, stats, regions) {
  const cls = status === STATUS.CHANGED ? 'v--changed'
    : status === STATUS.IDENTICAL ? 'v--same'
      : 'v--noise';

  const diffPixels = num(stats?.diffCount);
  const pct = typeof stats?.diffPercentage === 'number'
    ? `${stats.diffPercentage.toFixed(3)}%`
    : '—';
  const regionCount = regions.length;

  let sentence;
  if (status === STATUS.IDENTICAL) {
    sentence = '两张图逐像素完全一致，没有检测到任何差异。';
  } else if (status === STATUS.CHANGED) {
    sentence = `有 ${diffPixels} 个像素不同，占重叠区 ${pct}，`
      + `形成 ${regionCount} 处变更区域。`;
  } else {
    sentence = `有 ${diffPixels} 个像素不同（占 ${pct}），但没有任何一处达到`
      + `「最小区域」标准 —— 通常是压缩噪声或亚像素抖动，不是真实改动。`;
  }

  return `<section class="verdict ${cls}">
  <b>${esc(STATUS_LABEL[status])}</b>
  <p>${esc(sentence)}</p>
</section>`;
}

/** 三联图。缺图时留占位，不静默少一格 —— 否则看不出是没图还是渲染失败 */
function compareHtml(images, imageMeta, width, height) {
  const fig = (src, title, sub) => `<figure class="cmp">
    ${src ? `<img src="${src}" alt="${esc(title)}">` : '<div class="cmp-missing">无图</div>'}
    <figcaption><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</figcaption>
  </figure>`;

  const infoOf = (m, fallback) => {
    if (!m) return fallback;
    const parts = [];
    if (m.width && m.height) parts.push(`${m.width}×${m.height}`);
    if (m.format) parts.push(m.format);
    const size = formatBytes(m.fileSize);
    if (size) parts.push(size);
    return parts.join(' · ') || fallback;
  };

  return `<div class="compare">
  ${fig(images?.a, '原始图片', infoOf(imageMeta?.a, '—'))}
  ${fig(images?.b, '修改后图片', infoOf(imageMeta?.b, '—'))}
  ${fig(images?.diff, '差异图', `${width}×${height}`)}
</div>`;
}

function regionRows(regions) {
  if (!regions.length) {
    return '<tr><td colspan="8" class="empty">没有达到「最小区域」标准的变更</td></tr>';
  }
  // 按面积降序 —— 最该看的排最上面
  const sorted = regions.slice().sort((a, b) => (b.pixels ?? 0) - (a.pixels ?? 0));
  return sorted.map((r, i) => {
    const m = r.metrics;
    const shift = m && Number.isFinite(m.meanLumaShift)
      ? `${m.meanLumaShift > 0 ? '+' : ''}${m.meanLumaShift.toFixed(1)}`
      : '—';
    const cx = r.center ? `${Math.round(r.center.x)}, ${Math.round(r.center.y)}` : '—';
    return `<tr>
    <td class="c-num">${i + 1}</td>
    <td class="c-num">${r.x}, ${r.y}</td>
    <td class="c-num">${r.width}×${r.height}</td>
    <td class="c-num">${num(r.pixels)}</td>
    <td class="c-num">${typeof r.percentage === 'number' ? `${r.percentage.toFixed(3)}%` : '—'}</td>
    <td class="c-num">${m ? num(m.meanDeltaE, 1) : '—'}</td>
    <td class="c-num">${m ? num(m.maxDeltaE, 1) : '—'}</td>
    <td class="c-num">${shift}</td>
    <td class="c-num">${cx}</td>
  </tr>`;
  }).join('\n    ');
}

/** 单图报告独有的样式 */
const EXTRA_CSS = `
  .verdict { display:flex; flex-direction:column; gap:6px; border-radius:8px;
             padding:16px 18px; margin:22px 0; border:1px solid; }
  .verdict b { font-size:18px; font-weight:600; }
  .verdict p { margin:0; font-size:13px; line-height:1.7; color:var(--fg); }
  .v--changed { background:#2a0d16; border-color:#6b1f33; }
  .v--changed b { color:var(--warn); }
  .v--same { background:#0f2418; border-color:#1f5335; }
  .v--same b { color:var(--ok); }
  .v--noise { background:#1c1c24; border-color:#33333f; }
  .v--noise b { color:var(--dim); }

  .compare { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
             gap:14px; margin:14px 0 8px; }
  .cmp { margin:0; background:var(--card); border:1px solid var(--line);
         border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:8px; }
  .cmp img { width:100%; height:auto; max-height:420px; object-fit:contain;
             background:#000; border-radius:5px; display:block; }
  .cmp-missing { height:160px; display:flex; align-items:center; justify-content:center;
                 background:#000; border-radius:5px; color:#4a4a58; font-size:12px; }
  .cmp figcaption { display:flex; flex-direction:column; gap:2px; font-size:12px; }
  .cmp figcaption b { font-weight:600; }
  .cmp figcaption span { color:var(--dim); font-size:11px; }

  .section-title { margin:26px 0 10px; font-size:14px; font-weight:600; }
  table.kv { width:auto; min-width:340px; }
  table.kv th { width:110px; background:transparent; color:var(--dim); font-weight:400;
                position:static; border-bottom:1px solid var(--line); }
  table.kv tr:last-child th, table.kv tr:last-child td { border-bottom:none; }
`;

/**
 * @param {object} o
 * @param {string} o.view 导出时的视图 key（滑块 / 高亮 …）
 * @param {object} o.settings 当时的检测设置
 * @param {number} o.width 差异计算的宽（两图的重叠区，= min 宽）
 * @param {number} o.height
 * @param {Array} o.regions 变更区域（含 metrics）
 * @param {object|null} o.stats
 * @param {{a?:object,b?:object}} [o.imageMeta] 两张图的 {fileName,width,height,fileSize,format}
 * @param {{a?:string,b?:string,diff?:string}} [o.images] 内联 data URL
 * @param {number} [o.imageMaxDim] 嵌入图的长边上限，用于在报告里如实说明
 * @returns {string} 完整的 HTML 文档
 */
export function buildPairReportHtml({
  view, settings, width, height, regions = [], stats, imageMeta, images, imageMaxDim,
}) {
  const generatedAt = stamp();
  const status = classifyPair({
    diffCount: stats?.diffCount ?? 0,
    regionCount: regions.length,
  });

  const { maxDeltaE, meanDeltaE } = summarizeDeltaE(regions);
  const m = stats?.metrics ?? {};

  const cards = cardsHtml([
    [status === STATUS.CHANGED ? 'warn' : 'dim', num(stats?.diffCount), '差异像素'],
    ['', typeof stats?.diffPercentage === 'number' ? `${stats.diffPercentage.toFixed(3)}%` : '—', '差异占比'],
    [regions.length > 0 ? 'warn' : 'dim', regions.length, '变更区域'],
    ['info', num(maxDeltaE, 1), '最大 ΔE'],
    ['', num(meanDeltaE, 1), '平均 ΔE'],
    ['', num(m.mse, 4), 'MSE'],
    ['', Number.isFinite(m.psnr) ? num(m.psnr, 2) : '∞', 'PSNR (dB)'],
    ['', num(m.ssim, 4), 'SSIM'],
  ]);

  const params = paramsHtml([
    ['阈值', settings?.threshold],
    ['最小区域', settings?.minArea != null ? `${settings.minArea} px` : ''],
    ['合并距离', settings?.mergeDistance != null ? `${settings.mergeDistance} px` : ''],
    ['比较口径', diffModeLabel(settings?.diffMode)],
    ['抗锯齿过滤', settings?.antiAlias ? '开' : '关'],
    ['忽略位移', settings?.ignoreShift ? `±${settings.ignoreShift} px` : '关'],
    ['高亮色', settings?.highlightColor],
    ['差异计算区', `${width}×${height}`],
  ]);

  const fileInfo = [
    kvRow('原始图片', imageMeta?.a?.fileName ?? '—'),
    kvRow('修改后图片', imageMeta?.b?.fileName ?? '—'),
    kvRow('原始尺寸', imageMeta?.a ? `${imageMeta.a.width}×${imageMeta.a.height}` : ''),
    kvRow('修改后尺寸', imageMeta?.b ? `${imageMeta.b.width}×${imageMeta.b.height}` : ''),
    kvRow('原始体积', formatBytes(imageMeta?.a?.fileSize)),
    kvRow('修改后体积', formatBytes(imageMeta?.b?.fileSize)),
  ].filter(Boolean).join('\n      ');

  const headerHtml = `  <h1>单图差异报告</h1>
  <p class="meta">
    生成于 ${esc(generatedAt)} ·
    视图 ${esc(view ?? '—')} ·
    检测口径 阈值 ${esc(settings?.threshold)} / 最小区域 ${esc(settings?.minArea)}px /
    合并距离 ${esc(settings?.mergeDistance)}px / ${esc(diffModeLabel(settings?.diffMode))}
    ${settings?.ignoreShift ? ` / 忽略位移 ±${esc(settings.ignoreShift)}px` : ''}
    ${settings?.antiAlias ? ' / 抗锯齿过滤' : ''}
  </p>`;

  const bodyHtml = `${verdictHtml(status, stats, regions)}

<h3 class="section-title">图像对照</h3>
${compareHtml(images, imageMeta, width, height)}
<p class="meta-sub">嵌入图为预览（长边 ≤ ${esc(imageMaxDim ?? '—')} px），原始尺寸见下方文件信息。</p>

<div class="cards">${cards}</div>

<h3 class="section-title">检测参数</h3>
<div class="params">${params}</div>

<h3 class="section-title">文件信息</h3>
<table class="kv">
  <tbody>
      ${fileInfo}
  </tbody>
</table>

<h3 class="section-title">变更区域（${regions.length}）</h3>
<table>
  <thead>
    <tr>
      <th class="c-num">#</th><th class="c-num">左上角 x, y</th><th class="c-num">尺寸</th>
      <th class="c-num">像素数</th><th class="c-num">占比</th>
      <th class="c-num">平均 ΔE</th><th class="c-num">最大 ΔE</th>
      <th class="c-num">平均亮度偏移</th><th class="c-num">中心 x, y</th>
    </tr>
  </thead>
  <tbody>
    ${regionRows(regions)}
  </tbody>
</table>
<p class="meta-sub">区域按面积降序。亮度偏移为带符号值，正数表示该区域整体变亮。</p>`;

  return reportPage({
    title: `PixelTrace 单图差异报告 — ${generatedAt}`,
    headerHtml,
    bodyHtml,
    extraCss: EXTRA_CSS,
  });
}

/** 供 UI 直接下载。文件名带上原图名，归档时不用再翻记录 */
export function buildPairReportFilename(fileName, ext = 'html') {
  const stem = String(fileName ?? '').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  const safe = stem.slice(0, 40) || 'report';
  return `pixeltrace_report_${safe}_${compactStamp()}.${ext}`;
}
