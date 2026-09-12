/**
 * 主题 (PRODUCT.md §15.5)
 *
 * 暗色是默认 —— 那是产品原本的形态；亮色是后加的选项，两者可随时切换。
 *
 * 为什么主题挂在 <html> 的 data-theme 属性上，而不是给某个容器加类名：
 * 属性可以在 index.html 里就写好，配合一段内联脚本先读 localStorage，
 * 页面解析的第一帧就已经是对的主题，刷新不会先闪一下另一种主题。
 * 如果等 React 挂载后再设置，亮色用户每次刷新都要先看一帧暗色。
 *
 * 这份文件刻意不 import 任何 React —— 纯函数可以在 Node 里直接单测，
 * 而 storage 被禁用（隐私模式、企业策略）时的兜底逻辑正是最该测的部分。
 */

/** 供 UI 取标签与图标 */
export const THEMES = Object.freeze([
  { key: 'dark', label: '暗色', icon: '☾' },
  { key: 'light', label: '亮色', icon: '☀' },
]);

export const DEFAULT_THEME = 'dark';
export const THEME_STORAGE_KEY = 'pixeltrace.theme';
export const THEME_ATTR = 'data-theme';

export function isTheme(v) {
  return v === 'dark' || v === 'light';
}

export function themeMeta(key) {
  return THEMES.find((t) => t.key === key) ?? THEMES[0];
}

/** 两态互切 */
export function nextTheme(theme) {
  return theme === 'light' ? 'dark' : 'light';
}

/**
 * 读回用户偏好。
 *
 * localStorage 在隐私模式或企业策略下会直接抛异常（不是返回 null），
 * 所以必须 try 住 —— 主题读不出来只是回默认值，不该让整个应用崩掉。
 * storage 可注入，方便单测。
 */
export function readStoredTheme(storage) {
  try {
    const s = storage ?? globalThis.localStorage;
    const v = s?.getItem(THEME_STORAGE_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** 写入偏好。写不进去不算错误（只是下次打开记不住），返回是否成功 */
export function storeTheme(theme, storage) {
  if (!isTheme(theme)) return false;
  try {
    const s = storage ?? globalThis.localStorage;
    if (!s) return false;
    s.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

/** 把主题写到 <html> 上 —— CSS 里所有 [data-theme="light"] 规则都挂在这个属性上 */
export function applyTheme(theme, root) {
  const el = root ?? globalThis.document?.documentElement;
  if (!el) return false;
  el.setAttribute(THEME_ATTR, isTheme(theme) ? theme : DEFAULT_THEME);
  return true;
}

/**
 * 画布里的颜色用不了 CSS 变量，只能把变量值读回来自己拼成 rgba。
 *
 * 传进来的形如 "255, 255, 255"（--fg-rgb 这类通道变量的值）。
 * 读不到时回退成白色 —— 至少和暗色主题一致，不会画出一片透明。
 */
export function rgbaFromChannels(channels, alpha) {
  const c = String(channels ?? '').trim() || '255, 255, 255';
  return `rgba(${c}, ${alpha})`;
}

/** 从元素的计算样式里读一个通道变量，读不到返回 null */
export function readChannels(name, el) {
  const target = el ?? globalThis.document?.documentElement;
  if (!target || typeof globalThis.getComputedStyle !== 'function') return null;
  const v = globalThis.getComputedStyle(target).getPropertyValue(name);
  return v ? v.trim() : null;
}
