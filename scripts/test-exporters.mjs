/**
 * 导出模块的已知答案测试。
 *
 * 重点是「产物本身对不对」，不是「函数有没有返回」：
 *  - 文件名必须符合 §10.1 的 pixeltrace_{view}_{suffix}_{timestamp}.{ext}
 *  - CSV 必须有 BOM、CRLF、表头、统计汇总段（BOM 决定 Excel 打开中文是否乱码）
 *  - 报告 JSON 必须带检测参数快照，且不能把 base64 缩略图塞进去
 *  - runExport 的分支守卫要在「没数据」时明确失败，而不是静默产出空文件
 *
 * runExport 会走下载路径，这里用最小 DOM shim 把下载内容截获下来检查。
 *
 * 运行: npm run test-exporters
 */

// ─── 最小 DOM shim：只覆盖导出用到的部分 ───

const downloads = [];

globalThis.Blob = class Blob {
  constructor(parts, opts) {
    this.parts = parts;
    this.type = opts?.type;
    this._text = parts.join('');
  }
  text() { return Promise.resolve(this._text); }
};

globalThis.URL.createObjectURL = () => 'blob:mock';
globalThis.URL.revokeObjectURL = () => {};

globalThis.document = {
  createElement(tag) {
    return {
      tagName: String(tag).toUpperCase(),
      href: '',
      download: '',
      click() {
        downloads.push({ name: this.download, href: this.href });
      },
    };
  },
  body: { appendChild() {}, removeChild() {} },
};

// Blob 需要能取回文本；把最后一次构造的 blob 记下来
const RealBlob = globalThis.Blob;
globalThis.Blob = class extends RealBlob {
  constructor(parts, opts) {
    super(parts, opts);
    globalThis.__lastBlob = this;
  }
};

const {
  EXPORT_KINDS,
  EXPORT_FORMATS,
  getFormat,
  buildExportName,
  buildRegionsCsv,
  buildDiffReport,
  kindProducesImage,
  kindSupportsMarkers,
  runExport,
} = await import('../src/utils/exporters.js');

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

// ─── 固定输入 ───

const REGIONS = [
  { id: 1, x: 10, y: 20, width: 60, height: 60, pixels: 3600, percentage: 6.25, center: { x: 40, y: 50 }, thumbnail: 'data:image/jpeg;base64,AAAA' },
  { id: 2, x: 100, y: 80, width: 40, height: 30, pixels: 1200, percentage: 2.0833, center: { x: 120, y: 95 }, thumbnail: 'data:image/jpeg;base64,BBBB' },
];

const STATS = {
  totalPixels: 76800,
  diffCount: 4944,
  diffPercentage: 6.4375,
  regionCount: 2,
};

const SETTINGS = {
  threshold: 30,
  minArea: 50,
  mergeDistance: 10,
  highlightColor: '#ff3366',
};

// ─── 1. 静态表 ───

console.log('\n─── 1. 静态表 ───');
check('导出内容有 4 类', EXPORT_KINDS.length, 4);
check('导出格式有 3 种', EXPORT_FORMATS.length, 3);
ok('四类导出物的 key 与 runExport 分支一致',
  EXPORT_KINDS.every((k) => ['view', 'full', 'report', 'csv'].includes(k.key)),
  EXPORT_KINDS.map((k) => k.key).join(','));
ok('每种格式都有 mime', EXPORT_FORMATS.every((f) => typeof f.mime === 'string' && f.mime.includes('/')));
check('PNG 标记为无损', getFormat('png').lossy, false);
check('JPEG 标记为有损', getFormat('jpeg').lossy, true);
check('未知格式回退到第一个（PNG）', getFormat('bmp-nope').key, 'png');

// ─── 2. 文件名 (§10.1) ───

console.log('\n─── 2. 文件名 ───');
const nameView = buildExportName('slider', '', 'png');
ok('当前视图：pixeltrace_{view}_{ts}.png（无后缀段，不出现连续下划线）',
  /^pixeltrace_slider_\d{8}-\d{6}\.png$/.test(nameView), nameView);

const nameDiff = buildExportName('highlight', 'diff', 'png');
ok('全分辨率：pixeltrace_{view}_diff_{ts}.png',
  /^pixeltrace_highlight_diff_\d{8}-\d{6}\.png$/.test(nameDiff), nameDiff);

const nameCsv = buildExportName('split', 'regions', 'csv');
ok('CSV：pixeltrace_{view}_regions_{ts}.csv',
  /^pixeltrace_split_regions_\d{8}-\d{6}\.csv$/.test(nameCsv), nameCsv);

ok('文件名不含非法字符', !/[\\/:*?"<>|]/.test(nameView + nameDiff + nameCsv));

// ─── 3. 变更列表 CSV ───

console.log('\n─── 3. 变更列表 CSV ───');
const csv = buildRegionsCsv(REGIONS, STATS);
const lines = csv.split('\r\n');

check('以 BOM 开头（Excel 中文表头不乱码）', csv.charCodeAt(0), 0xfeff);
ok('用 CRLF 换行', csv.includes('\r\n') && !/[^\r]\n/.test(csv));
check('表头字段数', lines[0].replace('\ufeff', '').split(',').length, 7);
ok('表头含「编号」', lines[0].includes('编号'));
ok('表头含「差异像素」', lines[0].includes('差异像素'));
ok('第 1 个区域行以编号 1 开头', lines[1].startsWith('1,'), lines[1]);
ok('第 2 个区域行以编号 2 开头', lines[2].startsWith('2,'), lines[2]);
ok('区域坐标写入正确', lines[1].startsWith('1,10,20,60,60,3600,'), lines[1]);
ok('占比保留 3 位小数', lines[1].endsWith(',6.250'), lines[1]);
ok('统计汇总含总像素数', csv.includes('总像素数,76800'));
ok('统计汇总含差异像素数', csv.includes('差异像素数,4944'));
ok('统计汇总含变更区域数', csv.includes('变更区域数,2'));
ok('区域行数与输入一致', lines.filter((l) => /^\d+,/.test(l)).length, 2);

// 无 stats 时不应崩，也不应产出空表
const csvNoStats = buildRegionsCsv(REGIONS, null);
ok('无 stats 时仍产出区域行', csvNoStats.includes('1,10,20,60,60,3600,'));

// ─── 4. 差异报告 JSON ───

console.log('\n─── 4. 差异报告 JSON ───');
const report = buildDiffReport({
  view: 'highlight',
  width: 320,
  height: 240,
  settings: SETTINGS,
  stats: STATS,
  regions: REGIONS,
  imageNames: { a: 'before.png', b: 'after.png' },
});

check('生成器名', report.generator, 'PixelTrace');
check('视图名', report.view, 'highlight');
check('图像尺寸', `${report.image.width}×${report.image.height}`, '320×240');
check('记录了原始文件名', report.image.names.a, 'before.png');
check('记录了修改后文件名', report.image.names.b, 'after.png');
check('检测阈值快照', report.detectSettings.threshold, 30);
check('最小面积快照', report.detectSettings.minArea, 50);
check('合并距离快照', report.detectSettings.mergeDistance, 10);
check('高亮色快照', report.detectSettings.highlightColor, '#ff3366');
check('统计：差异像素', report.stats.diffPixels, 4944);
check('统计：区域数', report.stats.regionCount, 2);
check('区域数一致', report.regions.length, 2);
ok('时间戳是合法 ISO 串', !Number.isNaN(Date.parse(report.exportedAt)), report.exportedAt);
ok('缩略图未被写进 JSON（否则文件会膨胀几十倍）',
  report.regions.every((r) => !('thumbnail' in r)));
ok('区域保留了中心点', report.regions[0].center && report.regions[0].center.x === 40);
ok('JSON 可序列化', typeof JSON.stringify(report) === 'string');
check('占比已四舍五入到 4 位', report.regions[1].percentage, 2.0833);

// ─── 5. 选项依赖（面板据此显隐，不能摆无效控件）───

console.log('\n─── 5. 选项依赖 ───');
check('当前视图会产图', kindProducesImage('view'), true);
check('全分辨率会产图', kindProducesImage('full'), true);
check('报告会产图', kindProducesImage('report'), true);
check('CSV 不产图', kindProducesImage('csv'), false);

check('当前视图不画区域框（所见即所得）', kindSupportsMarkers('view'), false);
check('全分辨率可画区域框', kindSupportsMarkers('full'), true);
check('报告可画区域框', kindSupportsMarkers('report'), true);
check('CSV 无区域框概念', kindSupportsMarkers('csv'), false);

// ─── 6. runExport 分支守卫 ───

console.log('\n─── 6. runExport 分支守卫 ───');
const EMPTY = null;

let r = await runExport(EMPTY, { kind: 'view' });
check('无数据时失败', r.ok, false);
ok('无数据时给出原因', typeof r.error === 'string' && r.error.length > 0, r.error);

r = await runExport({ view: 'slider', regions: [] }, { kind: 'csv' });
check('CSV：没有区域时失败', r.ok, false);
ok('CSV：给出原因', r.error.includes('变更区域'), r.error);

r = await runExport({ view: 'slider', mask: null, width: 0, height: 0 }, { kind: 'full' });
check('全分辨率：没有 mask 时失败', r.ok, false);
ok('全分辨率：给出原因', r.error.includes('尚未就绪'), r.error);

r = await runExport({ view: 'slider', mask: null, width: 0, height: 0 }, { kind: 'report' });
check('报告：没有 mask 时同样失败', r.ok, false);

// ─── 7. runExport CSV 端到端 ───

console.log('\n─── 7. runExport CSV 端到端 ───');
downloads.length = 0;
r = await runExport(
  { view: 'split', settings: SETTINGS, regions: REGIONS, stats: STATS, width: 320, height: 240 },
  { kind: 'csv' }
);

check('CSV 导出成功', r.ok, true);
check('只产出 1 个文件', downloads.length, 1);
ok('文件名带 regions 后缀与 .csv 扩展名',
  /^pixeltrace_split_regions_\d{8}-\d{6}\.csv$/.test(downloads[0].name), downloads[0].name);
check('返回值里带上文件名', r.files[0], downloads[0].name);

const downloadedText = await globalThis.__lastBlob.text();
ok('下载内容与 buildRegionsCsv 一致', downloadedText === buildRegionsCsv(REGIONS, STATS));
ok('下载内容带 BOM', downloadedText.charCodeAt(0) === 0xfeff);
check('下载 Blob 的 MIME', globalThis.__lastBlob.type, 'text/csv;charset=utf-8');

console.log(`\n${'='.repeat(46)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
console.log('='.repeat(46));
process.exit(failed === 0 ? 0 : 1);
