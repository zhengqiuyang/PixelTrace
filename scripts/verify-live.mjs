// 端到端验证 toast 链路：往隐藏 input 塞一个损坏的 png，
// 应用应该 toastError → sonner 渲染 [data-sonner-toast]，
// 且它的主题属性跟随页面 data-theme 切换。
import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'https://zhengqiuyang.github.io/PixelTrace/';
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
    let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
};

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

try {
  let t = null;
  for (let i = 0; i < 40; i++) { try { t = await getJSON('/json'); break; } catch { await sleep(250); } }
  if (!t) throw new Error('DevTools 端口没起来');

  const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    } else if (m.method) events.push(m);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('JS threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('DOM.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: URL });
  // 等应用真正渲染出来，别用固定 sleep（网络抖动会让它失准）
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 25000) {
    try {
      ready = await ev(`!!document.querySelector('.app')`);
      if (ready) break;
    } catch { /* 页面还没准备好执行 JS */ }
    await sleep(300);
  }
  if (!ready) throw new Error('25s 内应用没渲染出来');
  await sleep(800);

  // ── 1. Toaster 容器挂载（sonner 2.x 用 React Aria 顶层容器）──
  const toasterSection = await ev(`
    !!document.querySelector('section[data-react-aria-top-layer]')`);
  check('Toaster 顶层容器已挂载', toasterSection);
  check('初始没有 toast 渲染', await ev(`document.querySelectorAll('[data-sonner-toast]').length === 0`));

  // ── 2. 往单对上传器的 input 塞一个损坏的 png ──
  // 直接在页面里造 File + DataTransfer 再派发 change，
  // 比 DOM.setFileInputFiles 稳（那个接口对 objectId 的上下文要求很苛刻）。
  const injected = await ev(`(() => {
    const input = document.querySelector('.uploader-zone input[type="file"]');
    if (!input) return 'no-input';
    const dt = new DataTransfer();
    dt.items.add(new File([new TextEncoder().encode('this is definitely not a PNG file')],
                          'corrupt.png', { type: 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.closest('.uploader-zone').querySelector('.uploader-label').textContent;
  })()`);
  if (injected === 'no-input') throw new Error('没找到单对上传器的 file input');
  console.log(`  → 往「${injected}」塞了 corrupt.png`);
  await sleep(2000);

  // ── 3. 应该弹出一个 error toast ──
  const toastCount = await ev(`document.querySelectorAll('[data-sonner-toast]').length`);
  check('损坏文件触发了 toast', toastCount > 0, `${toastCount} 条`);

  const toastInfo = await ev(`(() => {
    const t = document.querySelector('[data-sonner-toast]');
    if (!t) return null;
    const toaster = t.closest('[data-sonner-toaster]');
    return {
      type: t.dataset.type,
      toasterTheme: toaster?.dataset.sonnerTheme,
      pageTheme: document.documentElement.dataset.theme || 'dark',
      text: t.textContent.trim().slice(0, 60),
      borderTopColor: getComputedStyle(t).borderTopColor,
    };
  })()`);
  check('toast 类型是 error', toastInfo?.type === 'error', `type=${toastInfo?.type}`);
  check('toast 文本是校验报错', toastInfo?.text?.length > 0, JSON.stringify(toastInfo?.text));
  check('toaster 有 data-sonner-theme', !!toastInfo?.toasterTheme, `theme=${toastInfo?.toasterTheme}`);
  check('toaster 主题 == 页面主题', toastInfo?.toasterTheme === toastInfo?.pageTheme,
    `toaster=${toastInfo?.toasterTheme} page=${toastInfo?.pageTheme}`);

  // ── 4. 切主题，toast 主题应该跟着变（验证 useAppTheme 修复）──
  const before = toastInfo?.toasterTheme;
  await ev(`document.querySelector('.theme-toggle').click()`);
  await sleep(700);
  const after = await ev(`document.querySelector('[data-sonner-toaster]')?.dataset.sonnerTheme`);
  const pageAfter = await ev(`document.documentElement.dataset.theme || 'dark'`);
  check('切主题后 toaster 主题变了', before !== after, `${before} → ${after}`);
  check('切主题后仍与页面主题一致', after === pageAfter, `toaster=${after} page=${pageAfter}`);

  // ── 5. 模式切换：两块面板常驻，只切可见性 ──
  await ev(`Array.from(document.querySelectorAll('.mode-btn'))
    .find(b => b.textContent.includes('批量')).click()`);
  await sleep(600);
  const panes = await ev(`(() => {
    const all = Array.from(document.querySelectorAll('.mode-pane'));
    return { total: all.length, visible: all.filter(p => getComputedStyle(p).display !== 'none').length };
  })()`);
  check('两块面板都常驻在 DOM', panes.total === 2, `total=${panes.total}`);
  check('批量模式下只有一块可见', panes.visible === 1, `visible=${panes.visible}`);

  await ev(`Array.from(document.querySelectorAll('.mode-btn'))
    .find(b => b.textContent.includes('单对')).click()`);
  await sleep(500);
  check('切回单对后面板数不变（状态保得住）',
    await ev(`document.querySelectorAll('.mode-pane').length`) === 2);

  // ── 6. 控制台 ──
  const exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown');
  const consoleErrors = events.filter((e) =>
    e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error');
  check('没有未捕获异常', exceptions.length === 0,
    exceptions[0] ? String(exceptions[0].params.exceptionDetails?.exception?.description || '').slice(0, 180) : 'clean');
  check('没有 console.error', consoleErrors.length === 0,
    consoleErrors[0] ? consoleErrors[0].params.args.map((a) => a.value || '').join(' ').slice(0, 180) : 'clean');

  ws.close();
} catch (e) {
  console.log('!! 验证脚本出错:', e.message);
  failures++;
} finally {
  chrome.kill('SIGKILL');
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项未通过 ===`);
process.exit(failures === 0 ? 0 : 1);
