/**
 * 报告外壳 —— 批量报告与单对报告共用的那一层。
 *
 * 两份报告都是「自包含 HTML」：内嵌 data URL、系统字体栈、零外链，
 * 可以直接发给别人、丢进归档、断网打开、打印成 PDF。
 * 样式、转义、卡片、表格、徽章这些东西如果各写一份，
 * 两份报告的观感很快就会分叉（改了批量忘了改单对），所以抽到这里。
 *
 * 各报告只用 extraCss 追加自己独有的部分。
 */

export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** 数字格式化；非有限数一律显示「—」，避免报告里出现 NaN */
export const num = (v, digits = 0) => (typeof v === 'number' && Number.isFinite(v)
  ? v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—');

export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 文件名里的时间戳，形如 20260912-175503 */
export function compactStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
    + `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 卡片行。items: [[classSuffix, value, label], ...] */
export function cardsHtml(items) {
  return items.map(([cls, value, label]) => (
    `<div class="card ${cls}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`
  )).join('');
}

/** 参数快照：键值对列表，值用 <code> 突出 */
export function paramsHtml(pairs) {
  return pairs
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<div class="param"><span>${esc(k)}</span><code>${esc(v)}</code></div>`)
    .join('');
}

const SHARED_CSS = `
  :root { --bg:#0f0f14; --card:#17171f; --line:#2a2a36; --fg:#e6e6ee; --dim:#8b8b9c;
          --ok:#3ddc84; --warn:#ff3366; --info:#5aa9ff; --amber:#ffb020; }
  * { box-sizing:border-box; }
  body { margin:0; padding:32px 28px 64px; background:var(--bg); color:var(--fg);
         font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif; }
  h1 { margin:0 0 6px; font-size:22px; font-weight:600; }
  h3 { margin:0 0 8px; font-size:14px; font-weight:600; }
  .meta { margin:0; color:var(--dim); font-size:13px; }
  .meta-sub { margin:6px 0 0; color:var(--dim); font-size:12px; }
  code { background:#000; padding:1px 5px; border-radius:3px; font-size:12px; color:var(--amber); }

  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin:24px 0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px 16px;
          display:flex; flex-direction:column; gap:4px; }
  .card b { font-size:24px; font-weight:600; }
  .card span { color:var(--dim); font-size:12px; }
  .card.ok b { color:var(--ok); } .card.warn b { color:var(--warn); }
  .card.info b { color:var(--info); } .card.err b { color:var(--warn); }
  .card.dim b { color:var(--dim); }

  .notice { background:#241a08; border:1px solid #6b4a10; border-radius:8px; padding:14px 16px; margin:20px 0; }
  .notice p { margin:0 0 8px; font-size:13px; line-height:1.7; }
  .notice ul { margin:0; padding-left:20px; font-size:12px; color:var(--dim); }

  /* 参数快照：横向排列，窄屏自动折行 */
  .params { display:flex; flex-wrap:wrap; gap:8px 20px; background:var(--card);
            border:1px solid var(--line); border-radius:8px; padding:14px 16px; margin:20px 0; }
  .param { display:flex; align-items:baseline; gap:7px; font-size:12px; }
  .param span { color:var(--dim); }

  table { width:100%; border-collapse:collapse; background:var(--card);
          border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  th, td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--line); vertical-align:top; }
  th { background:#1d1d27; color:var(--dim); font-size:12px; font-weight:600; white-space:nowrap;
       position:sticky; top:0; z-index:1; }
  tr:last-child td { border-bottom:none; }
  tr[hidden] { display:none; }
  .c-num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .c-file { min-width:220px; }

  .badge { display:inline-block; padding:2px 9px; border-radius:20px; font-size:12px; white-space:nowrap; }
  .b-identical { background:#12301f; color:var(--ok); }
  .b-changed   { background:#3a0f1c; color:var(--warn); }
  .b-noise     { background:#26262f; color:var(--dim); }
  .b-only-a, .b-only-b { background:#12283f; color:var(--info); }
  .b-error     { background:#3a2a0c; color:var(--amber); }
  .b-pending   { background:#1f1f28; color:#5a5a68; }

  .path { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; word-break:break-all; }
  .path--sub { color:var(--dim); margin-top:2px; }
  .tags { margin-top:5px; display:flex; flex-wrap:wrap; gap:5px; }
  .tag { font-size:11px; padding:1px 7px; border-radius:3px; background:#26262f; color:var(--dim); }
  .tag--loose { background:#2b2410; color:var(--amber); }
  .tag--warn { background:#3a0f1c; color:var(--warn); }

  .ths { display:flex; gap:8px; }
  .th { margin:0; display:flex; flex-direction:column; gap:3px; }
  .th img { width:96px; height:64px; object-fit:contain; background:#000;
            border:1px solid var(--line); border-radius:4px; display:block; }
  .th figcaption { font-size:10px; color:var(--dim); text-align:center; }
  .th--empty { justify-content:center; }
  .th--empty figcaption { color:#4a4a58; }
  .dim { color:var(--dim); }

  .empty { padding:40px; text-align:center; color:var(--dim); }
  footer { margin-top:28px; color:#55555f; font-size:12px; }

  @media print {
    body { background:#fff; color:#000; padding:0; }
    .card, table, th { background:#fff; }
    th { position:static; }
    .bar, .filters { display:none; }
    tr[hidden] { display:table-row; }
  }
`;

/**
 * 拼一份完整报告。
 *
 * @param {string} title <title> 与浏览器标签
 * @param {string} headerHtml 页头（h1 + meta）
 * @param {string} bodyHtml 正文
 * @param {string} [extraCss] 该报告独有的样式，追加在共享样式之后
 * @param {string} [script] 行内脚本（不含 <script> 标签）
 */
export function reportPage({ title, headerHtml, bodyHtml, extraCss = '', script = '' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${SHARED_CSS}${extraCss}</style>
</head>
<body>
<header>
${headerHtml}
</header>

${bodyHtml}

<footer>
  由 PixelTrace 生成 · 差异在两张图的重叠区域（较小尺寸）上计算 ·
  ΔE 为 CIE76 色差，SSIM 按 8×8 分块统计
</footer>
${script ? `\n<script>\n${script}\n</script>` : ''}
</body>
</html>`;
}
