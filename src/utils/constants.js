/**
 * PixelTrace 全局常量定义
 * 来源: PRODUCT.md §6.1.2, §8.1, §9.1, §9.2, §11.1, §12.1, §15.1
 */

// ─── 视图类型 ────────────────────────────────────────────

export const VIEW_TYPES = Object.freeze({
  SLIDER: 'slider',
  SPLIT: 'split',
  FADE: 'fade',
  BLINK: 'blink',
  SUBTRACT: 'subtract',
  HIGHLIGHT: 'highlight',
});

export const VIEW_LIST = Object.freeze([
  { key: VIEW_TYPES.SLIDER, label: '滑块', icon: '⊞', shortcut: '1' },
  { key: VIEW_TYPES.SPLIT, label: '分割', icon: '⫿', shortcut: '2' },
  { key: VIEW_TYPES.FADE, label: '淡化', icon: '◐', shortcut: '3' },
  { key: VIEW_TYPES.BLINK, label: '闪烁', icon: '⚡', shortcut: '4' },
  { key: VIEW_TYPES.SUBTRACT, label: '相减', icon: '⊖', shortcut: '5' },
  { key: VIEW_TYPES.HIGHLIGHT, label: '高亮', icon: '◎', shortcut: '6' },
]);

// ─── 缩放级别 (§6.1.2) ──────────────────────────────────

export const ZOOM_LEVELS = Object.freeze([
  0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 0.80, 0.90,
  1.00, 1.25, 1.50, 2.00, 3.00, 4.00, 8.00, 16.00,
]);

export const ZOOM_MIN = 0.10;
export const ZOOM_MAX = 16.00;
export const ZOOM_STEP = 0.10; // 每次滚轮步进
export const ZOOM_ANIMATION_DURATION = 150; // ms

// ─── 差异检测 (§8.4) ────────────────────────────────────

export const DEFAULT_THRESHOLD = 30;
export const MIN_THRESHOLD = 5;
export const MAX_THRESHOLD = 100;

export const DEFAULT_MIN_AREA = 50;
export const MIN_AREA_MIN = 1;
export const MIN_AREA_MAX = 5000;

export const DEFAULT_MERGE_DISTANCE = 10;
export const MERGE_DISTANCE_MIN = 0;
export const MERGE_DISTANCE_MAX = 100;

export const MAX_REGIONS = 500; // §8.4: 超过截断

// ─── 图片约束 (§5.1.3) ──────────────────────────────────
// 原先这里有一道 4096×4096 的上传尺寸闸门（MAX_IMAGE_WIDTH / MAX_IMAGE_HEIGHT），
// 已按要求取消 —— 上传不再因尺寸被拒。
// 下面两个常量只剩「内存不足时等比缩小的目标值」这一个用途，不参与任何校验，
// 因此改名，避免日后被误当成上限重新接回校验流程。

export const SCALE_TARGET_WIDTH = 4096;
export const SCALE_TARGET_HEIGHT = 4096;
export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const SUPPORTED_FORMATS = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
]);
export const SUPPORTED_EXTENSIONS = Object.freeze([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp',
]);

// ─── 上传区状态 (§4.3) ──────────────────────────────────

export const UPLOAD_STATES = Object.freeze({
  EMPTY: 'empty',
  DRAG_OVER: 'dragOver',
  LOADING: 'loading',
  UPLOADED: 'uploaded',
  ERROR: 'error',
});

// ─── 快捷键映射 (§11.1) ─────────────────────────────────

export const SHORTCUTS = Object.freeze({
  // 视图切换
  VIEW_1: '1',
  VIEW_2: '2',
  VIEW_3: '3',
  VIEW_4: '4',
  VIEW_5: '5',
  VIEW_6: '6',

  // 缩放
  ZOOM_IN: '=',
  ZOOM_OUT: '-',
  ZOOM_RESET: '0',
  ZOOM_FIT: '0', // Ctrl+0
  ZOOM_100: '1', // Ctrl+1
  ZOOM_200: '2', // Ctrl+2

  // 平移
  PAN_UP: 'ArrowUp',
  PAN_DOWN: 'ArrowDown',
  PAN_LEFT: 'ArrowLeft',
  PAN_RIGHT: 'ArrowRight',
  PAN_HOME: 'Home',

  // 操作
  FULLSCREEN: 'f',
  COPY: 'c', // Ctrl+C
  EXPORT: 'e', // Ctrl+E
  EXPORT_FULL: 'e', // Ctrl+Shift+E
  ROTATE: 'r',
  INFO: 'i',
  SETTINGS: ',',
  HELP: '?',
  BACK: 'Escape',
});

// ─── 错误消息 (§12.1) ────────────────────────────────────

export const ERROR_MESSAGES = Object.freeze({
  UNSUPPORTED_FORMAT: {
    code: 'UNSUPPORTED_FORMAT',
    message: '不支持该文件格式，请上传 JPG/PNG/WebP/GIF',
    canContinue: false,
    canScale: false,
  },
  FILE_TOO_LARGE: {
    code: 'FILE_TOO_LARGE',
    message: (sizeMB) => `文件过大 (${sizeMB} MB)，建议压缩至 ${MAX_FILE_SIZE_MB}MB 以下`,
    canContinue: true,
    canScale: false,
  },
  CORRUPTED: {
    code: 'CORRUPTED',
    message: '无法读取该图片，文件可能已损坏',
    canContinue: false,
    canScale: false,
  },
  CLIPBOARD_EMPTY: {
    code: 'CLIPBOARD_EMPTY',
    message: '剪贴板中未检测到图片',
    canContinue: false,
    canScale: false,
  },
  SIZE_MISMATCH: {
    code: 'SIZE_MISMATCH',
    message: (w1, h1, w2, h2) =>
      `检测到图片尺寸不同 (原始: ${w1}×${h1}, 修改后: ${w2}×${h2})，是否自动对齐？`,
    canContinue: true,
    canScale: false,
  },
  // 尺寸闸门取消后，「缩放后继续」这条路径只剩这里会用到。
  // 注意：目前没有任何代码产出 OUT_OF_MEMORY —— 触发它的前置校验还没接，
  // 保留定义是为了不丢失 §12.1 的错误契约。
  OUT_OF_MEMORY: {
    code: 'OUT_OF_MEMORY',
    message: '图片过大导致内存不足，建议缩小图片',
    canContinue: false,
    canScale: true,
  },
  WORKER_UNAVAILABLE: {
    code: 'WORKER_UNAVAILABLE',
    message: '您的浏览器不支持 WebWorker，已降级为主线程计算',
    canContinue: true,
    canScale: false,
  },
});

// ─── 默认设置 (§9.3) ────────────────────────────────────

export const DEFAULT_SETTINGS = Object.freeze({
  // 差异检测
  threshold: DEFAULT_THRESHOLD,
  minArea: DEFAULT_MIN_AREA,
  mergeDistance: DEFAULT_MERGE_DISTANCE,

  // 显示
  showDiffBoxes: true,
  showRegionNumbers: true,
  showGrid: false,
  showCrosshair: false,
  highlightColor: '#ff3366',

  // 缩放平移
  zoomStepPercent: ZOOM_STEP * 100,
  smoothZoom: true,
  showZoomPercent: true,

  // 性能
  useWorker: true,
  renderScale: 1, // 1 | 0.5 | 0.25
});

// ─── 闪烁视图 (§7.4) ────────────────────────────────────

export const BLINK_SPEED_MIN = 100; // ms
export const BLINK_SPEED_MAX = 2000; // ms
export const BLINK_SPEED_DEFAULT = 500; // ms

// ─── 布局 (§4.1, §15.4) ────────────────────────────────

export const HEADER_HEIGHT = 56; // px
export const STATUS_BAR_HEIGHT = 32; // px
export const SIDEBAR_WIDTH = 240; // px
export const SIDEBAR_WIDTH_COLLAPSED = 0;

export const BREAKPOINT_MOBILE = 768;
export const BREAKPOINT_TABLET = 1200;

// ─── 动画 ──────────────────────────────────────────────

export const TOAST_DURATION = 3000; // ms
export const SIDEBAR_ANIMATION = 200; // ms
export const BOUNCE_OVERSHOOT = 100; // px
export const BOUNCE_ANIMATION = 200; // ms
