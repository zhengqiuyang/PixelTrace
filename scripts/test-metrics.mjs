/**
 * 图像质量指标的已知答案测试。
 *
 * 关键点：这些指标必须拿「标准参考值」来验，不能只看它算得出数。
 *  - Lab 用 sRGB 三原色的公开标准值
 *  - PSNR 用可手算的构造（整体 +10 灰阶 → MSE=100 → PSNR≈28.13 dB）
 *  - ΔE 用可手算的灰阶对（100 → 150 应为 ≈19.7）
 *
 * 运行: npm run test-metrics
 */

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

const {
  computeImageMetrics,
  computeRegionMetrics,
  rgbToLab,
  deltaE76,
  formatPsnr,
  describeDeltaE,
} = await import('../src/utils/imageMetrics.js');

let passed = 0;
let failed = 0;

function near(name, actual, expected, tol) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}  (${actual.toFixed(4)} ≈ ${expected})`);
  } else {
    failed++;
    console.log(`  ✗ ${name}  实际 ${actual.toFixed(4)}，期望 ${expected} ± ${tol}`);
  }
}

function check(name, actual, expected) {
  if (Object.is(actual, expected)) {
    passed++;
    console.log(`  ✓ ${name}  (${String(actual)})`);
  } else {
    failed++;
    console.log(`  ✗ ${name}  实际 ${String(actual)}，期望 ${String(expected)}`);
  }
}

function checkTrue(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  (${detail})` : ''}`);
  }
}

function solid(w, h, [r, g, b]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  return new ImageData(d, w, h);
}

const W = 64;
const H = 64;

console.log('\n─── 1. sRGB → Lab 对照公开标准值 ───');
// 这三组是 sRGB 三原色在 D65 下的公认 Lab 值，用来确认色彩空间转换没写错
{
  const [lr, ar, br] = rgbToLab(255, 0, 0);
  near('红 (255,0,0) 的 L*', lr, 53.24, 0.5);
  near('红 (255,0,0) 的 a*', ar, 80.09, 0.5);
  near('红 (255,0,0) 的 b*', br, 67.20, 0.5);

  const [lg, ag, bg] = rgbToLab(0, 255, 0);
  near('绿 (0,255,0) 的 L*', lg, 87.73, 0.5);
  near('绿 (0,255,0) 的 a*', ag, -86.18, 0.5);
  near('绿 (0,255,0) 的 b*', bg, 83.18, 0.5);

  const [lb, ab, bb] = rgbToLab(0, 0, 255);
  near('蓝 (0,0,255) 的 L*', lb, 32.30, 0.5);
  near('蓝 (0,0,255) 的 a*', ab, 79.19, 0.5);
  near('蓝 (0,0,255) 的 b*', bb, -107.86, 0.5);

  near('黑色的 L*', rgbToLab(0, 0, 0)[0], 0, 1e-6);
  near('白色的 L*', rgbToLab(255, 255, 255)[0], 100, 0.05);
}

console.log('\n─── 2. ΔE76 可手算用例 ───');
{
  near('黑 vs 白 ΔE', deltaE76(rgbToLab(0, 0, 0), rgbToLab(255, 255, 255)), 100, 0.1);
  near('同色 ΔE', deltaE76(rgbToLab(120, 80, 40), rgbToLab(120, 80, 40)), 0, 1e-12);
  // 灰阶 100 → 150：L* 从 ≈42.38 升到 ≈62.07，a*/b* 均为 0，故 ΔE ≈ 19.69
  near('灰阶 100→150 的 ΔE', deltaE76(rgbToLab(100, 100, 100), rgbToLab(150, 150, 150)), 19.69, 0.5);
  checkTrue('ΔE 量级解释：19.7 属「明显偏色」', describeDeltaE(19.69) === '明显偏色', describeDeltaE(19.69));
  checkTrue('ΔE 量级解释：0.5 属「几乎看不出」', describeDeltaE(0.5) === '几乎看不出', describeDeltaE(0.5));
}

console.log('\n─── 3. MSE / PSNR ───');
{
  const same = computeImageMetrics(solid(W, H, [100, 100, 100]), solid(W, H, [100, 100, 100]));
  check('相同图 MSE 为 0', same.mse, 0);
  check('相同图 PSNR 为无穷大', same.psnr, Infinity);
  checkTrue('无穷大 PSNR 显示为 ∞ dB', formatPsnr(same.psnr) === '∞ dB', formatPsnr(same.psnr));

  // 整体 +10：每像素平方误差 3×100，通道数 3×N → MSE 恰好 100
  const shifted = computeImageMetrics(solid(W, H, [100, 100, 100]), solid(W, H, [110, 110, 110]));
  near('整体 +10 灰阶的 MSE', shifted.mse, 100, 1e-9);
  // PSNR = 10·log10(255² / 100) = 10·log10(650.25) ≈ 28.1308
  near('整体 +10 灰阶的 PSNR', shifted.psnr, 28.1308, 1e-3);
  checkTrue('PSNR 带单位格式化', formatPsnr(shifted.psnr).endsWith(' dB'), formatPsnr(shifted.psnr));

  // PSNR 应随误差增大而单调下降
  const worse = computeImageMetrics(solid(W, H, [100, 100, 100]), solid(W, H, [160, 160, 160]));
  checkTrue('误差越大 PSNR 越低', worse.psnr < shifted.psnr, `${worse.psnr.toFixed(2)} < ${shifted.psnr.toFixed(2)}`);
}

console.log('\n─── 4. SSIM ───');
{
  const same = computeImageMetrics(solid(W, H, [100, 100, 100]), solid(W, H, [100, 100, 100]));
  near('相同图 SSIM', same.ssim, 1, 1e-9);
  checkTrue('相同图 SSIM 分块数 > 0', same.ssimBlocks > 0, `blocks=${same.ssimBlocks}`);

  // 64×64 / 8×8 = 8×8 = 64 个完整块
  check('64×64 在 8×8 分块下的块数', same.ssimBlocks, 64);

  const shifted = computeImageMetrics(solid(W, H, [100, 100, 100]), solid(W, H, [110, 110, 110]));
  checkTrue('整体亮度偏移会降低 SSIM', shifted.ssim < 1, shifted.ssim.toFixed(6));
  checkTrue('SSIM 落在 [0,1] 内', shifted.ssim >= 0 && shifted.ssim <= 1, shifted.ssim.toFixed(6));

  // 结构性破坏（半图反色）应比同等幅度的整体偏移更伤 SSIM
  const half = solid(W, H, [100, 100, 100]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W / 2; x++) {
      const p = (y * W + x) * 4;
      half.data[p] = 200; half.data[p + 1] = 200; half.data[p + 2] = 200;
    }
  }
  const structural = computeImageMetrics(solid(W, H, [100, 100, 100]), half);
  checkTrue(
    '结构性破坏比整体偏移更伤 SSIM',
    structural.ssim < shifted.ssim,
    `${structural.ssim.toFixed(4)} < ${shifted.ssim.toFixed(4)}`
  );
}

console.log('\n─── 5. 直方图 ───');
{
  const m = computeImageMetrics(solid(W, H, [30, 60, 90]), solid(W, H, [30, 60, 90]));
  const { a: ha, b: hb } = m.histogram;

  check('直方图数组长度（3 通道 × 256）', ha.length, 768);
  check('R=30 的计数', ha[30], W * H);
  check('G=60 的计数', ha[256 + 60], W * H);
  check('B=90 的计数', ha[512 + 90], W * H);
  check('其他 bin 为 0', ha[31], 0);

  const total = ha.reduce((s, v) => s + v, 0);
  check('直方图总数 = 像素数 × 3', total, W * H * 3);
  checkTrue('两张图直方图分别独立统计', hb[512 + 90] === W * H, `${hb[512 + 90]}`);
}

console.log('\n─── 6. 逐区域指标 ───');
{
  // A 全灰 100；B 在 (16,16)-(48,48) 内改为灰 150
  const a = solid(W, H, [100, 100, 100]);
  const b = solid(W, H, [100, 100, 100]);
  for (let y = 16; y < 48; y++) {
    for (let x = 16; x < 48; x++) {
      const p = (y * W + x) * 4;
      b.data[p] = 150; b.data[p + 1] = 150; b.data[p + 2] = 150;
    }
  }

  // 造一个覆盖该方块的掩码与区域
  const mask = new Uint8Array(W * H);
  for (let y = 16; y < 48; y++) {
    for (let x = 16; x < 48; x++) mask[y * W + x] = 1;
  }
  const regions = [{ id: 1, x: 16, y: 16, width: 32, height: 32, pixels: 32 * 32, percentage: 100 }];

  const out = computeRegionMetrics(a, b, mask, regions);
  const m = out[0].metrics;

  checkTrue('区域指标已生成', !!m);
  check('区域样本数', m.sampled, 32 * 32);
  check('区域总差异像素数', m.total, 32 * 32);
  near('区域平均 ΔE（灰阶 100→150）', m.meanDeltaE, 19.69, 0.5);
  near('区域最大 ΔE', m.maxDeltaE, 19.69, 0.5);
  near('区域平均亮度变化（+50 灰阶）', m.meanLumaShift, 50, 1e-6);
  near('区域平均亮度变化绝对值', m.meanAbsLumaShift, 50, 1e-6);

  // 变暗应当是负号，不能只给绝对值
  const darker = computeRegionMetrics(b, a, mask, regions)[0].metrics;
  near('区域变暗时平均亮度变化为负', darker.meanLumaShift, -50, 1e-6);

  // 大区域抽样：上限 20000
  const bigW = 400;
  const bigH = 400;
  const bigA = solid(bigW, bigH, [100, 100, 100]);
  const bigB = solid(bigW, bigH, [150, 150, 150]);
  const bigMask = new Uint8Array(bigW * bigH).fill(1);
  const bigRegion = [{ id: 1, x: 0, y: 0, width: bigW, height: bigH, pixels: bigW * bigH, percentage: 100 }];
  const bigM = computeRegionMetrics(bigA, bigB, bigMask, bigRegion)[0].metrics;
  check('超大区域的抽样上限', bigM.sampled, 20000);
  check('超大区域的总数仍为真实值', bigM.total, bigW * bigH);
  near('抽样后均值仍然准确', bigM.meanDeltaE, 19.69, 0.5);
}

console.log(`\n${'='.repeat(46)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
console.log('='.repeat(46));
process.exit(failed === 0 ? 0 : 1);
