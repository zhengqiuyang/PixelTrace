/**
 * 主题与配色的已知答案测试。
 *
 * 分两层：
 *
 * 1) theme.js 的纯函数 —— 重点在「storage 被禁用」这条路径。
 *    隐私模式 / 企业策略下 localStorage 会直接抛异常（不是返回 null），
 *    主题读不出来只能回默认值，绝不能让整个应用崩掉。
 *
 * 2) index.css 里的配色 token —— 对比度是算出来的，不是调出来的。
 *    亮色主题最容易翻车的就是「荧光色压在白底上」，肉眼盯截图会漏，
 *    把 WCAG 阈值写成断言就一条都跑不掉。
 *
 * 这一层刻意直接解析 index.css 的源码而不是浏览器计算值：
 * 跑得快、能进 npm test，而且改坏 token 时立刻报错，不用等浏览器验证。
 * （浏览器侧的整页审计在 pt-theme.cjs，那层负责「有没有漏掉某个组件」。）
 *
 * 运行: npm run test-theme
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEME_ATTR,
  isTheme,
  themeMeta,
  nextTheme,
  readStoredTheme,
  storeTheme,
  applyTheme,
  rgbaFromChannels,
  readChannels,
} from '../src/utils/theme.js';

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = Object.is(actual, expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}  (${JSON.stringify(actual)})`);
  } else {
    failed++;
    console.log(`  ✗ ${name}\n      实际: ${JSON.stringify(actual)}\n      期望: ${JSON.stringify(expected)}`);
  }
}

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  (${detail})` : ''}`);
  }
}

// ═══════════════════════════════════════════════════════════
// 第一层：theme.js
// ═══════════════════════════════════════════════════════════

console.log('\n─── 1. 主题枚举与元数据 ───');
{
  check('默认是暗色', DEFAULT_THEME, 'dark');
  check('存储键', THEME_STORAGE_KEY, 'pixeltrace.theme');
  check('属性名', THEME_ATTR, 'data-theme');
  check('两套主题', THEMES.length, 2);
  check('两套主题的 key', THEMES.map((t) => t.key).join(','), 'dark,light');
  ok('每套主题都有 label', THEMES.every((t) => typeof t.label === 'string' && t.label.length > 0));
  ok('每套主题都有 icon', THEMES.every((t) => typeof t.icon === 'string' && t.icon.length > 0));
  ok('枚举被冻结（UI 不该改它）', Object.isFrozen(THEMES));

  check('themeMeta(dark).label', themeMeta('dark').label, '暗色');
  check('themeMeta(light).label', themeMeta('light').label, '亮色');
  check('themeMeta 遇到非法值回退到第一套', themeMeta('neon').key, 'dark');
  check('themeMeta(undefined) 不崩', themeMeta(undefined).key, 'dark');
}

console.log('\n─── 2. 两态互切 ───');
{
  check('dark → light', nextTheme('dark'), 'light');
  check('light → dark', nextTheme('light'), 'dark');
  check('非法值 → light（当作暗色处理）', nextTheme('neon'), 'light');
  check('切两次回到原点', nextTheme(nextTheme('dark')), 'dark');
  ok('isTheme 只认这两个值', isTheme('dark') && isTheme('light') && !isTheme('Dark') && !isTheme(''));
}

console.log('\n─── 3. 读回偏好（storage 可注入）───');
{
  const makeStorage = (value) => ({ getItem: (k) => (k === THEME_STORAGE_KEY ? value : null) });

  check('读到 light', readStoredTheme(makeStorage('light')), 'light');
  check('读到 dark', readStoredTheme(makeStorage('dark')), 'dark');
  check('存的是垃圾值 → 回默认', readStoredTheme(makeStorage('neon')), 'dark');
  check('存的是空串 → 回默认', readStoredTheme(makeStorage('')), 'dark');
  check('键名不匹配 → 回默认', readStoredTheme({ getItem: () => null }), 'dark');

  // 隐私模式：getItem 直接抛，而不是返回 null
  const throwing = {
    getItem() {
      throw new DOMException('denied', 'SecurityError');
    },
  };
  check('storage 抛异常 → 回默认而不是崩', readStoredTheme(throwing), 'dark');
  check('storage 是 null → 回默认', readStoredTheme(null), 'dark');
  check('storage 缺 getItem → 回默认', readStoredTheme({}), 'dark');
}

console.log('\n─── 4. 写入偏好 ───');
{
  const written = [];
  const spy = { setItem: (k, v) => written.push(`${k}=${v}`) };
  check('写入 light 成功', storeTheme('light', spy), true);
  check('真的写进去了', written.join(','), `${THEME_STORAGE_KEY}=light`);

  check('非法值不写', storeTheme('neon', spy), false);
  check('非法值确实没写', written.length, 1);
  check('undefined 不写', storeTheme(undefined, spy), false);

  const throwing = {
    setItem() {
      throw new DOMException('quota', 'QuotaExceededError');
    },
  };
  check('写失败返回 false 而不是抛（配额满）', storeTheme('dark', throwing), false);
  check('storage 为 null 返回 false', storeTheme('dark', null), false);
}

console.log('\n─── 5. 写到 <html> 上 ───');
{
  const attrs = [];
  const el = { setAttribute: (k, v) => attrs.push(`${k}=${v}`) };

  check('applyTheme 成功', applyTheme('light', el), true);
  check('属性名与值都对', attrs.join(','), `${THEME_ATTR}=light`);

  applyTheme('neon', el);
  check('非法值落到默认主题', attrs[1], `${THEME_ATTR}=dark`);

  // Node 里没有 document，这条走的是「拿不到根元素」的兜底
  check('拿不到根元素时返回 false', applyTheme('light'), false);
}

console.log('\n─── 6. 画布用色：通道变量 → rgba ───');
{
  check('拼出 rgba', rgbaFromChannels('20, 20, 28', 0.07), 'rgba(20, 20, 28, 0.07)');
  check('两侧空白被 trim', rgbaFromChannels('  0, 115, 70  ', 0.5), 'rgba(0, 115, 70, 0.5)');
  // 读不到时必须回退成白色 —— 至少和暗色主题一致，不会画出一片透明
  check('null → 回退白色', rgbaFromChannels(null, 0.07), 'rgba(255, 255, 255, 0.07)');
  check('空串 → 回退白色', rgbaFromChannels('', 0.07), 'rgba(255, 255, 255, 0.07)');
  check('undefined → 回退白色', rgbaFromChannels(undefined, 0.07), 'rgba(255, 255, 255, 0.07)');

  globalThis.getComputedStyle = () => ({
    getPropertyValue: (n) => (n === '--fg-rgb' ? '  20, 20, 28  ' : ''),
  });
  // 必须传一个元素 —— Node 里没有 document，不传的话会在拿到 target 之前就返回 null，
  // 那样测的是「没有根元素」而不是「读到了并 trim」。
  check('readChannels 读到并 trim', readChannels('--fg-rgb', {}), '20, 20, 28');
  check('readChannels 读不到返回 null', readChannels('--nope', {}), null);
  delete globalThis.getComputedStyle;

  check('没有 getComputedStyle 时返回 null', readChannels('--fg-rgb', {}), null);
  check('没有根元素时返回 null', readChannels('--fg-rgb'), null);
}

// ═══════════════════════════════════════════════════════════
// 第二层：index.css 的配色 token
// ═══════════════════════════════════════════════════════════

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const INDEX_CSS = read('../src/index.css');
const APP_CSS = read('../src/App.css');

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 取选择器后第一对花括号之间的内容（要数嵌套，@media 会套一层） */
function blockOf(css, selector) {
  const clean = stripComments(css);
  const at = clean.indexOf(selector);
  if (at === -1) return null;
  const start = clean.indexOf('{', at);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    else if (clean[i] === '}') {
      depth--;
      if (depth === 0) return clean.slice(start + 1, i);
    }
  }
  return null;
}

function tokensOf(block) {
  const out = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  return out;
}

/** 按块列出 App.css 的规则，用来做「语义色不许落到 hover 底上」的静态检查 */
function rulesOf(css) {
  const clean = stripComments(css);
  const out = [];
  const re = /\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const before = clean.slice(0, m.index);
    const cut = Math.max(before.lastIndexOf('}'), before.lastIndexOf('{'));
    out.push({ sel: before.slice(cut + 1).trim(), body: m[1] });
  }
  return out;
}

function declsOf(body) {
  return body
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(':');
      return i === -1
        ? { prop: s.toLowerCase(), value: '' }
        : { prop: s.slice(0, i).trim().toLowerCase(), value: s.slice(i + 1).trim() };
    });
}

// ─── WCAG 对比度 ───

function parseColor(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) return [1, 2, 3].map((i) => Number(m[i]));
  return null;
}

function relLum([r, g, b]) {
  const f = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const AA_TEXT = 4.5;

const darkTokens = tokensOf(blockOf(INDEX_CSS, ':root'));
const lightTokens = tokensOf(blockOf(INDEX_CSS, "[data-theme='light']"));
const themes = [
  { name: '暗色', tokens: darkTokens },
  { name: '亮色', tokens: lightTokens },
];

console.log('\n─── 7. 两套主题的 token 都解析得到 ───');
{
  ok('解析出 :root（暗色）', Object.keys(darkTokens).length > 30, `${Object.keys(darkTokens).length} 个`);
  ok('解析出 [data-theme=light]', Object.keys(lightTokens).length > 20, `${Object.keys(lightTokens).length} 个`);

  for (const t of themes) {
    const missing = ['--bg-dark', '--bg-card', '--bg-main', '--bg-hover', '--text', '--text-dim', '--accent', '--on-accent', '--border'].filter(
      (k) => !t.tokens[k]
    );
    ok(`${t.name}：关键 token 齐全`, missing.length === 0, missing.join(' ') || '齐全');

    const bad = Object.entries(t.tokens)
      .filter(([k]) => !/^--(shadow|glow|glass|overlay|scrim|border-light|accent-glow|danger-glow)/.test(k))
      // --*-rgb 是通道三元组（"0, 255, 136"），不是完整色值，第 12 节单独测
      .filter(([k]) => !/^--[\w-]+-rgb$/.test(k))
      .filter(([k, v]) => /^--(bg|text|accent|danger|warn|info|alt|b-|on-|stage)/.test(k) && !parseColor(v));
    ok(`${t.name}：色值都能解析`, bad.length === 0, bad.map(([k, v]) => `${k}=${v}`).join(' ') || '全部可解析');
  }
}

console.log('\n─── 8. 文字色对比度（WCAG AA = 4.5:1）───');
{
  // 出现频次前三的文字色：--accent 62 次 / --text-dim 47 次 / --text 36 次。
  // 它们会落到所有表面（含 hover 态），所以四个面全都要过。
  const DOMINANT = ['--text', '--text-dim', '--accent'];

  // 其余文字色只出现在「内容面」上 —— 卡片、页面底、主区
  // （.batch-tag 的底就是 --bg-main）。hover 面上不放这些，见第 13 节的静态检查。
  const SEMANTIC = [
    '--danger',
    '--warn',
    '--info',
    '--alt',
    '--b-ok',
    '--b-warn',
    '--b-err',
    '--b-info',
    '--b-dim',
    '--accent-dim',
    '--accent-bright',
  ];

  const ALL_SURFACES = ['--bg-dark', '--bg-card', '--bg-main', '--bg-hover'];
  const CONTENT_SURFACES = ['--bg-dark', '--bg-card', '--bg-main'];

  for (const t of themes) {
    console.log(`  [${t.name}]`);
    const rows = [];

    for (const [group, tokens, surfaces] of [
      ['主文字', DOMINANT, ALL_SURFACES],
      ['语义色', SEMANTIC, CONTENT_SURFACES],
    ]) {
      for (const fg of tokens) {
        const fc = parseColor(t.tokens[fg]);
        if (!fc) {
          ok(`${t.name}：${fg} 存在且可解析`, false, String(t.tokens[fg]));
          continue;
        }
        for (const bg of surfaces) {
          const bc = parseColor(t.tokens[bg]);
          const r = contrast(fc, bc);
          const pass = r >= AA_TEXT;
          rows.push(`${fg} on ${bg} = ${r.toFixed(2)}${pass ? '' : ' ✗'}`);
          ok(`${t.name}：${group} ${fg} on ${bg} ≥ ${AA_TEXT}`, pass, `${r.toFixed(2)}:1`);
        }
      }
    }

    // 一行行打太多，压成紧凑表格便于人看
    console.log(`    ${rows.join(' | ')}`);
  }
}

console.log('\n─── 9. 压在 accent 实心底上的文字 ───');
{
  // .pixel-btn.accent / .export-segment.active 的文字，以及 hover 时的渐变顶色
  for (const t of themes) {
    const onAccent = parseColor(t.tokens['--on-accent']);
    for (const bg of ['--accent', '--accent-dim', '--accent-bright']) {
      const r = contrast(onAccent, parseColor(t.tokens[bg]));
      ok(`${t.name}：--on-accent on ${bg} ≥ ${AA_TEXT}`, r >= AA_TEXT, `${r.toFixed(2)}:1`);
    }
  }
}

console.log('\n─── 10. 文档里点名的那个值（index.css 的 --text-dim 注释）───');
{
  // 注释写着「最差的一面也有 4.73:1」，背景是 stat 卡（--bg-card 上叠 4% 墨色）。
  // 这里把那个派生背景写成常量，断言注释没吹牛。
  const statCard = [23, 23, 31]; // #17171f
  const r = contrast(parseColor(darkTokens['--text-dim']), statCard);
  ok('暗色 --text-dim 在 stat 卡 #17171f 上 ≥ 4.5', r >= AA_TEXT, `${r.toFixed(2)}:1`);

  const worse = contrast(parseColor(darkTokens['--text-dim']), parseColor(darkTokens['--bg-hover']));
  ok('暗色 --text-dim 在 --bg-hover 上也 ≥ 4.5', worse >= AA_TEXT, `${worse.toFixed(2)}:1`);

  // 它必须仍然明显比 --text 弱，否则层级就没了
  const vsText = contrast(parseColor(darkTokens['--text']), statCard);
  ok('--text-dim 仍明显弱于 --text（层级没丢）', r < vsText, `${r.toFixed(2)} vs ${vsText.toFixed(2)}`);
}

console.log('\n─── 11. 舞台不变量：导出所见即所得 ───');
{
  // 图片必须在稳定的中性暗底上比较，而且「当前视图」导出会把这个底色烤进 PNG。
  // 机制就是 --stage-* 只写在 :root、亮色块里绝不覆盖 —— 这条一旦被破坏，
  // 表现是「亮色主题下导出图变白底」，肉眼要对比两张导出图才发现。
  ok('--stage-void 定义在 :root', !!darkTokens['--stage-void'], darkTokens['--stage-void']);
  ok('--stage-bg 定义在 :root', !!darkTokens['--stage-bg'], darkTokens['--stage-bg']);
  ok('亮色块没有覆盖 --stage-void', lightTokens['--stage-void'] === undefined);
  ok('亮色块没有覆盖 --stage-bg', lightTokens['--stage-bg'] === undefined);

  const stageVoid = parseColor(darkTokens['--stage-void']);
  ok('--stage-void 是纯黑', stageVoid.join(',') === '0,0,0', darkTokens['--stage-void']);
  ok('--stage-bg 足够暗（亮底会洗掉浅色图）', relLum(parseColor(darkTokens['--stage-bg'])) < 0.01);

  // 舞台容器的底色必须走 --stage-void，不能改成随主题变的 --bg-*
  const wrapper = blockOf(APP_CSS, '.view-canvas-wrapper');
  ok('拿得到 .view-canvas-wrapper 规则', !!wrapper);
  ok('.view-canvas-wrapper 底色用 --stage-void', /background:\s*var\(--stage-void\)/.test(wrapper));
  ok(
    '.view-canvas-wrapper 底色没用会随主题翻的 token',
    !/background:\s*var\(--bg-(dark|card|main|hover)\)/.test(wrapper)
  );

  // 舞台上的浮层：亮色下必须几乎不透明，否则压在纯黑舞台上会掉到 4.5 以下
  const alphaOf = (v) => Number(String(v).match(/rgba\([^)]*,\s*([\d.]+)\s*\)/)?.[1] ?? NaN);
  const darkOverlay = alphaOf(darkTokens['--overlay-bg']);
  const lightOverlay = alphaOf(lightTokens['--overlay-bg']);
  ok('亮色 --overlay-bg 接近不透明（≥ 0.95）', lightOverlay >= 0.95, String(lightOverlay));
  ok('亮色浮层比暗色更不透明', lightOverlay > darkOverlay, `${lightOverlay} > ${darkOverlay}`);
}

console.log('\n─── 12. 通道变量：亮色块必须逐个翻面 ───');
{
  const channelNames = Object.keys(darkTokens).filter((k) => /^--[\w-]+-rgb$/.test(k));
  ok('暗色定义了通道变量', channelNames.length >= 8, `${channelNames.length} 个`);

  const missing = channelNames.filter((k) => lightTokens[k] === undefined);
  ok('亮色块覆盖了全部通道变量', missing.length === 0, missing.join(' ') || '全部覆盖');

  const chans = (v) =>
    String(v)
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
  const lum = (v) => relLum(chans(v));

  // --fg-rgb 是「墨色」：暗色下叠白、亮色下叠黑。语义不翻转，值必须翻。
  ok('暗色 --fg-rgb 是亮的', lum(darkTokens['--fg-rgb']) > 0.8, darkTokens['--fg-rgb']);
  ok('亮色 --fg-rgb 是暗的', lum(lightTokens['--fg-rgb']) < 0.1, lightTokens['--fg-rgb']);
  ok('--fg-rgb 确实翻面了', lum(lightTokens['--fg-rgb']) < lum(darkTokens['--fg-rgb']));

  // --accent-rgb 必须和 --accent 同一个色，否则叠加出来的色块和实心按钮会对不上
  const accentHex = parseColor(lightTokens['--accent']).join(',');
  ok('亮色 --accent-rgb 与 --accent 同色', chans(lightTokens['--accent-rgb']).join(',') === accentHex, `${chans(lightTokens['--accent-rgb']).join(',')} vs ${accentHex}`);

  const accentHexDark = parseColor(darkTokens['--accent']).join(',');
  ok('暗色 --accent-rgb 与 --accent 同色', chans(darkTokens['--accent-rgb']).join(',') === accentHexDark);
}

console.log('\n─── 13. 扫描线：亮色下必须更淡 ───');
{
  const darkA = Number(darkTokens['--scanline-alpha']);
  const lightA = Number(lightTokens['--scanline-alpha']);
  ok('两套主题都定义了 --scanline-alpha', Number.isFinite(darkA) && Number.isFinite(lightA), `${darkA} / ${lightA}`);
  ok('亮色更淡', lightA < darkA, `${lightA} < ${darkA}`);
  ok('两套都保持在「几乎看不见」的量级', darkA <= 0.02 && lightA <= 0.02);

  // 用量算一遍实际抖动：对比度必须远低于可感知阈值，否则白底上会出现条纹
  const scanline = (tokens, alpha) => {
    const bg = parseColor(tokens['--bg-dark']);
    const fg = tokens['--accent-rgb'].split(',').map((s) => Number(s.trim()));
    return bg.map((c, i) => c + alpha * (fg[i] - c));
  };
  for (const t of themes) {
    const a = Number(t.tokens['--scanline-alpha']);
    const bg = parseColor(t.tokens['--bg-dark']);
    const r = contrast(bg, scanline(t.tokens, a));
    ok(`${t.name}：扫描线条纹对比度 < 1.05:1（不可见）`, r < 1.05, `${r.toFixed(4)}:1`);
  }
}

console.log('\n─── 14. 静态守卫：语义色不许落到 hover 底上 ───');
{
  // 第 8 节只把语义色压在内容面上断言，前提是「hover 面上不放语义色」。
  // 这条约定不能只写在注释里 —— 以后谁给某行加了 hover 底又染了状态色，
  // 这里就会红，提醒把那个组合补进第 8 节的矩阵。
  const SEMANTIC = new Set([
    '--danger',
    '--warn',
    '--info',
    '--alt',
    '--b-ok',
    '--b-warn',
    '--b-err',
    '--b-info',
    '--b-dim',
    '--accent-dim',
    '--accent-bright',
  ]);

  const offenders = [];
  for (const { sel, body } of rulesOf(APP_CSS)) {
    const ds = declsOf(body);
    const hoverBg = ds.some(
      (d) => (d.prop === 'background' || d.prop === 'background-color') && d.value.includes('var(--bg-hover)')
    );
    if (!hoverBg) continue;
    for (const d of ds) {
      if (d.prop !== 'color') continue;
      const m = d.value.match(/var\((--[\w-]+)\)/);
      if (m && SEMANTIC.has(m[1])) offenders.push(`${sel} { color: ${m[1]} }`);
    }
  }
  ok('没有语义色压在 --bg-hover 上', offenders.length === 0, offenders.join(' | ') || '干净');

  // 反向确认扫描器真的在工作（别让上面那条变成永远为真的空跑）
  const hoverRules = rulesOf(APP_CSS).filter(({ body }) =>
    declsOf(body).some(
      (d) => (d.prop === 'background' || d.prop === 'background-color') && d.value.includes('var(--bg-hover)')
    )
  );
  ok('扫描器确实找到了 hover 底规则（不是空跑）', hoverRules.length > 0, `${hoverRules.length} 条`);

  // 顺带守住第 9 节修掉的那类问题：背景 token 不许当文字色
  const bgAsText = rulesOf(APP_CSS)
    .flatMap(({ sel, body }) => declsOf(body).map((d) => ({ sel, ...d })))
    .filter((d) => d.prop === 'color' && /var\(--(bg-dark|bg-card|bg-main|bg-hover|border|border-light)\)/.test(d.value))
    .map((d) => `${d.sel} { color: ${d.value} }`);
  ok('没有把背景/边框 token 当文字色用', bgAsText.length === 0, bgAsText.join(' | ') || '干净');
}

console.log('\n─── 15. 引用的 token 必须真的存在 ───');
{
  // .settings-segment.active 曾经写 color: var(--bg)，而 --bg 从未定义过。
  // 声明失效不会报错，color 只是变成「继承父级」—— 压在 accent 实心底上的
  // 文字颜色于是长期是不确定的，肉眼还看不出问题。这类 bug 只有扫一遍才抓得到。
  const defined = new Set();
  for (const m of stripComments(INDEX_CSS).matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);

  const missing = new Map();
  // 注释里提到变量名是正常的（比如解释某个坑），所以必须先去掉注释
  for (const m of stripComments(APP_CSS).matchAll(/var\((--[\w-]+)/g)) {
    if (!defined.has(m[1])) missing.set(m[1], (missing.get(m[1]) ?? 0) + 1);
  }

  ok(
    'App.css 没有引用未定义的 token',
    missing.size === 0,
    [...missing].map(([k, n]) => `${k} ×${n}`).join(' ') || `引用 ${defined.size} 个已定义 token`
  );

  // 反向确认扫描器不是空跑
  const refs = [...stripComments(APP_CSS).matchAll(/var\((--[\w-]+)/g)].length;
  ok('扫描器确实读到了引用（不是空跑）', refs > 100, `${refs} 处`);
}

console.log(`\n${'='.repeat(46)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
console.log('='.repeat(46));
process.exit(failed === 0 ? 0 : 1);
