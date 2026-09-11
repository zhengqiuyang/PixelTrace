/**
 * 导出实现 (PRODUCT.md §10.1 / §10.2)
 *
 * 四类导出物：
 *   view   —— 当前视图截图（复用 exportView.composeCurrentView 的所见即所得合成）
 *   full   —— 全分辨率差异图：按原图尺寸渲染，不受视口与缩放影响
 *   report —— 差异图 + 元数据 JSON（两个文件）
 *   csv    —— 变更区域列表
 *
 * 前三类共享同一套「格式 / 质量 / 区域标记 / 水印」选项（§10.2）。
 */

// ─── 导出内容 (§10.1) ───────────────────────────────────

export const EXPORT_KINDS = Object.freeze([
  { key: 'view', label: '当前视图', hint: '所见即所得的视口截图' },
  { key: 'full', label: '全分辨率差异图', hint: '按原图尺寸渲染的差异高亮图' },
  { key: 'report', label: '差异报告', hint: '差异图 PNG + 元数据 JSON，共两个文件' },
  { key: 'csv', label: '变更列表 CSV', hint: '所有变更区域的坐标与面积' },
]);

// ─── 导出格式 (§10.2) ───────────────────────────────────

export const EXPORT_FORMATS = Object.freeze([
  { key: 'png', label: 'PNG', mime: 'image/png', lossy: false },
  { key: 'jpeg', label: 'JPEG', mime: 'image/jpeg', lossy: true },
  { key: 'webp', label: 'WebP', mime: 'image/webp', lossy: true },
]);

export function getFormat(key) {
  return EXPORT_FORMATS.find((f) => f.key === key) ?? EXPORT_FORMATS[0];
}

// ─── 工具 ──────────────────────────────────────────────

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [255, 51, 102];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function localStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function compactStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
    + `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 文件名：pixeltrace_{view}_{suffix}_{timestamp}.{ext} */
export function buildExportName(view, suffix, ext) {
  const parts = ['pixeltrace', view];
  if (suffix) parts.push(suffix);
  return `${parts.join('_')}_${compactStamp()}.${ext}`;
}

/**
 * 水印：右下角一枚半透明标签。
 * 字号按图宽自适应，避免在大图上小到看不见、在小图上糊成一团。
 */
export function drawWatermark(ctx, width, height, text = 'PIXELTRACE') {
  const fontSize = Math.max(11, Math.round(width / 90));
  const pad = Math.round(fontSize * 0.6);
  const label = `${text} · ${localStamp()}`;

  ctx.save();
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width;
  const boxW = tw + pad * 2;
  const boxH = fontSize + pad * 2;
  const x = width - boxW - pad * 2;
  const y = height - boxH - pad * 2;

  ctx.fillStyle = 'rgba(8, 8, 12, 0.62)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

  ctx.fillStyle = '#00ff88';
  ctx.fillText(label, x + pad, y + boxH / 2);
  ctx.restore();
}

// ─── 全分辨率差异合成图 ─────────────────────────────────

/**
 * 按 mask 的原始尺寸渲染「灰度底图 + 高亮差异 + 区域框」。
 *
 * 直接改写 ImageData 的 TypedArray，而不是逐像素 fillRect ——
 * 4096×4096 有 1600 万像素，逐点 fillRect 会慢到不可接受。
 *
 * @param {object} o
 * @param {CanvasImageSource} o.baseImage 底图（通常是原始图）
 * @param {Uint8Array} o.mask 差异掩码，长度 = width*height
 * @param {number} o.width
 * @param {number} o.height
 * @param {Array} [o.regions]
 * @param {string} [o.highlightColor]
 * @param {boolean} [o.grayscale] 非差异区域是否转灰度
 * @param {boolean} [o.withMarkers] 是否画区域框与编号
 * @param {boolean} [o.withRegionNumbers]
 * @returns {HTMLCanvasElement|null}
 */
export function renderDiffComposite({
  baseImage,
  mask,
  width,
  height,
  regions = [],
  highlightColor = '#ff3366',
  grayscale = true,
  withMarkers = true,
  withRegionNumbers = true,
}) {
  if (!baseImage || !width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(baseImage, 0, 0, width, height);

  if (mask && mask.length) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    const [hr, hg, hb] = hexToRgb(highlightColor);
    const n = Math.min(mask.length, width * height);

    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (mask[i]) {
        d[p] = hr; d[p + 1] = hg; d[p + 2] = hb; d[p + 3] = 255;
      } else if (grayscale) {
        const g = (d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11) | 0;
        d[p] = g; d[p + 1] = g; d[p + 2] = g;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  if (withMarkers && regions.length) {
    // 线宽随图尺寸放大，否则在 4000px 宽的原图上 1.5px 的框等于看不见
    const scale = Math.max(1, Math.min(width, height) / 900);
    const fontPx = Math.round(14 * scale);

    regions.forEach((r) => {
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = 1.5 * scale;
      ctx.setLineDash([]);
      ctx.strokeRect(r.x, r.y, r.width, r.height);

      if (!withRegionNumbers) return;
      const label = `#${r.id}`;
      ctx.font = `bold ${fontPx}px monospace`;
      ctx.textBaseline = 'alphabetic';
      const tw = ctx.measureText(label).width;
      const boxH = fontPx + 6 * scale;
      const ly = Math.max(boxH, r.y - 4 * scale);
      ctx.fillStyle = highlightColor;
      ctx.fillRect(r.x, ly - boxH, tw + 8 * scale, boxH);
      ctx.fillStyle = '#000';
      ctx.fillText(label, r.x + 4 * scale, ly - 3 * scale);
    });
  }

  return canvas;
}

// ─── 变更列表 CSV (§10.1) ───────────────────────────────

export function buildRegionsCsv(regions, stats) {
  const rows = [
    ['编号', 'x', 'y', '宽度', '高度', '差异像素', '占总差异(%)'],
  ];

  regions.forEach((r) => {
    rows.push([
      r.id, r.x, r.y, r.width, r.height,
      r.pixels, r.percentage.toFixed(3),
    ]);
  });

  if (stats) {
    rows.push([]);
    rows.push(['总像素数', stats.totalPixels]);
    rows.push(['差异像素数', stats.diffCount]);
    rows.push(['差异占比(%)', stats.diffPercentage.toFixed(4)]);
    rows.push(['变更区域数', stats.regionCount]);
  }

  const body = rows
    .map((cols) => cols.map((c) => {
      const s = String(c ?? '');
      // 含逗号/引号/换行的字段按 RFC 4180 加引号
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n');

  // 前置 BOM，否则 Excel 打开中文表头会乱码
  return `\uFEFF${body}\r\n`;
}

// ─── 差异报告元数据 (§10.1) ─────────────────────────────

export function buildDiffReport({
  view,
  width,
  height,
  settings,
  stats,
  regions,
  imageNames,
}) {
  return {
    generator: 'PixelTrace',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    view,
    image: { width, height, names: imageNames ?? {} },
    detectSettings: {
      threshold: settings?.threshold,
      minArea: settings?.minArea,
      mergeDistance: settings?.mergeDistance,
      highlightColor: settings?.highlightColor,
    },
    stats: stats
      ? {
          totalPixels: stats.totalPixels,
          diffPixels: stats.diffCount,
          diffPercentage: Number(stats.diffPercentage.toFixed(4)),
          regionCount: stats.regionCount,
        }
      : null,
    // 缩略图是 base64，塞进 JSON 会让文件膨胀几十倍，去掉
    regions: regions.map((r) => ({
      id: r.id,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      pixels: r.pixels,
      percentage: Number(r.percentage.toFixed(4)),
      center: r.center,
    })),
  };
}

// ─── 输出 ──────────────────────────────────────────────

export function canvasToBlob(canvas, mime, qualityPercent) {
  return new Promise((resolve) => {
    const q = typeof qualityPercent === 'number'
      ? Math.min(1, Math.max(0.1, qualityPercent / 100))
      : undefined;
    // PNG 忽略 quality 参数，传 undefined 更干净
    canvas.toBlob((b) => resolve(b), mime, mime === 'image/png' ? undefined : q);
  });
}

export function downloadText(text, filename, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
