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

const {
  buildPairReportHtml,
  buildPairReportFilename,
} = await import('../src/utils/pairReport.js');

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
check('导出内容有 5 类', EXPORT_KINDS.length, 5);
check('导出格式有 3 种', EXPORT_FORMATS.length, 3);
ok('五类导出物的 key 与 runExport 分支一致',
  EXPORT_KINDS.every((k) => ['view', 'full', 'report', 'html', 'csv'].includes(k.key)),
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
check('HTML 报告不产图（格式/质量对它无意义）', kindProducesImage('html'), false);

check('当前视图不画区域框（所见即所得）', kindSupportsMarkers('view'), false);
check('全分辨率可画区域框', kindSupportsMarkers('full'), true);
check('报告可画区域框', kindSupportsMarkers('report'), true);
check('HTML 报告可画区域框（否则看不出哪块被判成变更）', kindSupportsMarkers('html'), true);
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

r = await runExport({ view: 'slider', mask: null, width: 0, height: 0 }, { kind: 'html' });
check('HTML 报告：没有 mask 时同样失败', r.ok, false);
ok('HTML 报告：给出原因', r.error.includes('尚未就绪'), r.error);

r = await runExport(
  { view: 'slider', mask: new Uint8Array(4), width: 2, height: 2, baseImage: null },
  { kind: 'html' }
);
check('HTML 报告：没有原图时失败', r.ok, false);
ok('HTML 报告：指出缺原图', r.error.includes('原始图片'), r.error);

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

// ─── 8. 单图 HTML 报告 ───

console.log('\n─── 8. 单图 HTML 报告 ───');

const REGIONS_M = [
  // 故意让小的排在前面，验证报告里会按面积降序重排
  { id: 2, x: 100, y: 80, width: 40, height: 30, pixels: 1200, percentage: 2.0833,
    center: { x: 120, y: 95 },
    metrics: { meanDeltaE: 12.5, maxDeltaE: 30.1, meanLumaShift: -4.2, meanAbsLumaShift: 4.2, sampled: 1200, total: 1200 } },
  { id: 1, x: 10, y: 20, width: 60, height: 60, pixels: 3600, percentage: 6.25,
    center: { x: 40, y: 50 },
    metrics: { meanDeltaE: 82.4, maxDeltaE: 88.7, meanLumaShift: 210, meanAbsLumaShift: 210, sampled: 3600, total: 3600 } },
];

const STATS_M = {
  totalPixels: 76800,
  diffCount: 4944,
  diffPercentage: 6.4375,
  regionCount: 2,
  metrics: { mse: 12.3456, psnr: 37.21, ssim: 0.9876 },
};

const IMG_META = {
  a: { fileName: 'before.png', width: 320, height: 240, fileSize: 12345, format: 'PNG' },
  b: { fileName: 'after.png', width: 320, height: 240, fileSize: 23456, format: 'JPEG' },
};
const IMAGES = {
  a: 'data:image/jpeg;base64,AAA',
  b: 'data:image/jpeg;base64,BBB',
  diff: 'data:image/png;base64,CCC',
};

const pairHtml = buildPairReportHtml({
  view: 'highlight',
  settings: { ...SETTINGS, diffMode: 'rgb', antiAlias: true, ignoreShift: 0 },
  width: 320,
  height: 240,
  regions: REGIONS_M,
  stats: STATS_M,
  imageMeta: IMG_META,
  images: IMAGES,
  imageMaxDim: 1200,
});

ok('是完整 HTML 文档', pairHtml.startsWith('<!doctype html>') && pairHtml.trimEnd().endsWith('</html>'));
ok('标题含「单图差异报告」', pairHtml.includes('<title>PixelTrace 单图差异报告'));
ok('正文标题是「单图差异报告」', pairHtml.includes('<h1>单图差异报告</h1>'));

// 结论横幅
ok('结论判定为「有差异」', pairHtml.includes('<b>有差异</b>'));
ok('结论给出差异像素数与占比',
  pairHtml.includes('4,944') && pairHtml.includes('6.438%'), '');
ok('结论提到形成 2 处区域', pairHtml.includes('形成 2 处变更区域'));

// 三联图
check('嵌入 3 张图（原始 / 修改后 / 差异）', (pairHtml.match(/<img /g) ?? []).length, 3);
ok('三张图都是内联 data URL',
  pairHtml.includes('data:image/jpeg;base64,AAA')
  && pairHtml.includes('data:image/jpeg;base64,BBB')
  && pairHtml.includes('data:image/png;base64,CCC'));
ok('如实说明嵌入图已缩放', pairHtml.includes('长边 ≤ 1200 px'));

// 指标卡片
ok('指标含差异像素 4,944', pairHtml.includes('<b>4,944</b>'));
ok('指标含差异占比 6.438%', pairHtml.includes('<b>6.438%</b>'));
ok('指标含最大 ΔE 88.7', pairHtml.includes('<b>88.7</b>'));
ok('指标含 MSE 12.3456', pairHtml.includes('<b>12.3456</b>'));
ok('指标含 PSNR 37.21', pairHtml.includes('<b>37.21</b>'));
ok('指标含 SSIM 0.9876', pairHtml.includes('<b>0.9876</b>'));

// 参数快照
ok('参数含阈值 30', pairHtml.includes('阈值</span><code>30</code>'));
ok('参数含最小区域 50 px', pairHtml.includes('最小区域</span><code>50 px</code>'));
ok('参数含合并距离 10 px', pairHtml.includes('合并距离</span><code>10 px</code>'));
ok('参数含比较口径', pairHtml.includes('比较口径</span><code>RGB 均值</code>'));
ok('参数含抗锯齿状态', pairHtml.includes('抗锯齿过滤</span><code>开</code>'));
ok('参数含高亮色', pairHtml.includes('高亮色</span><code>#ff3366</code>'));
ok('参数含差异计算区尺寸', pairHtml.includes('差异计算区</span><code>320×240</code>'));

// 文件信息
ok('文件信息含原始文件名', pairHtml.includes('before.png'));
ok('文件信息含修改后文件名', pairHtml.includes('after.png'));
ok('文件信息含尺寸', pairHtml.includes('320×240'));
ok('文件信息含体积（12.1 KB）', pairHtml.includes('12.1 KB'), '');
ok('文件信息含格式', pairHtml.includes('JPEG'));

// 区域表
const regionTrs = (pairHtml.match(/<tr>\s*<td class="c-num">\d+<\/td>/g) ?? []).length;
check('区域表 2 行', regionTrs, 2);
ok('区域按面积降序（60×60 排在 40×30 前）',
  pairHtml.indexOf('60×60') < pairHtml.indexOf('40×30'), '');
ok('区域含像素数', pairHtml.includes('<td class="c-num">3,600</td>'));
ok('区域含平均 ΔE', pairHtml.includes('<td class="c-num">82.4</td>'));
ok('区域含最大 ΔE', pairHtml.includes('<td class="c-num">88.7</td>'));
ok('亮度偏移带正号', pairHtml.includes('<td class="c-num">+210.0</td>'), '');
ok('亮度偏移保留负号', pairHtml.includes('<td class="c-num">-4.2</td>'), '');
ok('区域含中心坐标', pairHtml.includes('<td class="c-num">40, 50</td>'));

// 自包含性
ok('无外部资源引用（自包含）', !/<(script|link|img)[^>]+(src|href)="https?:/.test(pairHtml));

// 三档结论
const sameHtml = buildPairReportHtml({
  view: 'slider',
  settings: SETTINGS,
  width: 320,
  height: 240,
  regions: [],
  stats: { totalPixels: 76800, diffCount: 0, diffPercentage: 0, regionCount: 0 },
  imageMeta: IMG_META,
  images: IMAGES,
  imageMaxDim: 1200,
});
ok('diffCount=0 → 判定「一致」', sameHtml.includes('<b>一致</b>'));
ok('一致时不显示区域表内容', sameHtml.includes('没有达到「最小区域」标准的变更'));
ok('一致时 SSIM 仍给出', sameHtml.includes('<b>0.9876</b>') || sameHtml.includes('SSIM'));

const noiseHtml = buildPairReportHtml({
  view: 'slider',
  settings: SETTINGS,
  width: 320,
  height: 240,
  regions: [],
  stats: { totalPixels: 76800, diffCount: 5, diffPercentage: 0.0065, regionCount: 0 },
  imageMeta: IMG_META,
  images: IMAGES,
  imageMaxDim: 1200,
});
ok('有差异像素但无区域 → 判定「微差」', noiseHtml.includes('<b>微差</b>'));
ok('微差时说明不是真实改动', noiseHtml.includes('不是真实改动'));

// 极端输入
const bareHtml = buildPairReportHtml({ view: 'slider', width: 2, height: 2 });
ok('无 stats / 无区域 / 无图时不崩', bareHtml.includes('<!doctype html>'));
ok('缺图时给出占位而不是静默少一格', bareHtml.includes('cmp-missing'));

const xssHtml = buildPairReportHtml({
  view: 'slider',
  settings: SETTINGS,
  width: 2,
  height: 2,
  regions: [],
  stats: { diffCount: 0, diffPercentage: 0, regionCount: 0 },
  imageMeta: { a: { fileName: '<script>alert(1)</script>.png', width: 2, height: 2 } },
  images: {},
});
ok('文件名里的尖括号被转义', xssHtml.includes('&lt;script&gt;') && !xssHtml.includes('<script>alert'));

// 文件名
const repName = buildPairReportFilename('before.png');
ok('报告文件名带原图名：pixeltrace_report_before_{ts}.html',
  /^pixeltrace_report_before_\d{8}-\d{6}\.html$/.test(repName), repName);
const repNameBad = buildPairReportFilename('a/b:c*d?e.png');
ok('非法字符被替换掉', !/[\\/:*?"<>|]/.test(repNameBad), repNameBad);
const repNameLong = buildPairReportFilename(`${'x'.repeat(200)}.png`);
ok('超长文件名被截断', repNameLong.length < 120, String(repNameLong.length));
ok('无文件名时有兜底', buildPairReportFilename(null).includes('_report_'), buildPairReportFilename(null));

console.log(`\n${'='.repeat(46)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
console.log('='.repeat(46));
process.exit(failed === 0 ? 0 : 1);
