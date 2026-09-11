/**
 * 差异算法已知答案测试。
 *
 * computeDiff 是纯函数，只用到 ImageData 的 data/width/height 三个字段，
 * 所以补一个最小 ImageData 就能在 Node 里直接跑，不需要浏览器或 canvas。
 *
 * 运行: npm run test-diff
 */

// ─── 最小 ImageData 垫片 ───
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

const { computeDiff, DIFF_MODE } = await import('../src/utils/imageDiff.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected, { cmp = 'eq' } = {}) {
  let ok;
  if (cmp === 'eq') ok = actual === expected;
  else if (cmp === 'gt') ok = actual > expected;
  else if (cmp === 'gte') ok = actual >= expected;
  else if (cmp === 'lt') ok = actual < expected;
  else throw new Error('未知比较方式: ' + cmp);

  if (ok) {
    passed++;
    console.log(`  ✓ ${name}  (${actual})`);
  } else {
    failed++;
    console.log(`  ✗ ${name}  实际 ${actual}，期望 ${cmp === 'eq' ? '=' : cmp} ${expected}`);
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

/** 造一张纯色图 */
function solid(w, h, [r, g, b]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  return new ImageData(d, w, h);
}

/** 纯色图 + 若干矩形涂色 */
function withRects(w, h, base, rects) {
  const img = solid(w, h, base);
  for (const { x0, y0, x1, y1, color } of rects) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * w + x) * 4;
        img.data[p] = color[0];
        img.data[p + 1] = color[1];
        img.data[p + 2] = color[2];
      }
    }
  }
  return img;
}

const W = 64;
const H = 64;
const GRAY = [120, 120, 120];

console.log('\n─── 1. 完全相同 ───');
for (const mode of [DIFF_MODE.RGB, DIFF_MODE.LUMA, DIFF_MODE.PERCEPTUAL]) {
  const a = withRects(W, H, GRAY, [{ x0: 10, y0: 10, x1: 30, y1: 30, color: [200, 60, 40] }]);
  const b = withRects(W, H, GRAY, [{ x0: 10, y0: 10, x1: 30, y1: 30, color: [200, 60, 40] }]);
  const r = computeDiff(a, b, { threshold: 30, mode });
  check(`相同图 diffCount 为 0 [${mode}]`, r.diffCount, 0);
}

console.log('\n─── 2. 三种口径的阈值量纲可比 ───');
// 设计声明：perceptual 把 YIQ 色差换算成等效亮度差，纯亮度变化时 i=q=0，
// 于是三者的阈值应当落在同一个量纲上 —— 即「同一个阈值下结论大致相同」。
//
// 注意这里断言的是「量纲可比」而不是「逐位相等」。后者是过度指定：
// pixelmatch 的 YIQ 系数和是 1.00000001 而非精确 1，纯灰度变化的 y 会比
// 真实亮度差大一个 ULP，在「变化量恰好等于阈值」这一条线上必然偶有分歧。
// 有意义的不变量是：阈值明显低于变化量 → 都命中；明显高于 → 都不命中。
{
  const rect = { x0: 10, y0: 10, x1: 30, y1: 30 };
  const area = (30 - 10) * (30 - 10);
  const MODES = [DIFF_MODE.RGB, DIFF_MODE.LUMA, DIFF_MODE.PERCEPTUAL];

  const build = (step) => {
    const a = withRects(W, H, GRAY, [{ ...rect, color: GRAY }]);
    const b = withRects(W, H, GRAY, [{ ...rect, color: [120 + step, 120 + step, 120 + step] }]);
    return [a, b];
  };

  for (const step of [20, 30, 60]) {
    const [a, b] = build(step);

    const below = MODES.map((m) => computeDiff(a, b, { threshold: step - 1, mode: m }).diffCount);
    checkTrue(
      `亮度步进 ${step}：阈值 ${step - 1} 时三种口径都整块命中`,
      below.every((c) => c === area),
      `rgb=${below[0]} luma=${below[1]} perceptual=${below[2]}`
    );

    const above = MODES.map((m) => computeDiff(a, b, { threshold: step + 1, mode: m }).diffCount);
    checkTrue(
      `亮度步进 ${step}：阈值 ${step + 1} 时三种口径都不命中`,
      above.every((c) => c === 0),
      `rgb=${above[0]} luma=${above[1]} perceptual=${above[2]}`
    );

    // 恰好等于阈值这一线：rgb/luma 不计入（判据是 > threshold）。
    // perceptual 允许因上述 ULP 效应多命中，但不能比它们更迟钝。
    const at = MODES.map((m) => computeDiff(a, b, { threshold: step, mode: m }).diffCount);
    check(`亮度步进 ${step}：rgb 在阈值线上不计入`, at[0], 0);
    checkTrue(
      `亮度步进 ${step}：感知口径不会比 rgb 更迟钝`,
      at[2] >= at[0] && at[2] <= area,
      `perceptual=${at[2]} (rgb=${at[0]})`
    );
  }
}

console.log('\n─── 3. 感知口径放大纯色相变化 ───');
// YIQ 里绿、红的权重远高于蓝，所以「只改绿色」在感知口径下应显著高于 RGB 均值口径
{
  const rect = { x0: 10, y0: 10, x1: 30, y1: 30 };
  const a = withRects(W, H, GRAY, [{ ...rect, color: GRAY }]);
  const b = withRects(W, H, GRAY, [{ ...rect, color: [120, 120 + 155, 120] }]);

  const rgb = computeDiff(a, b, { threshold: 30, mode: DIFF_MODE.RGB }).diffCount;
  const per = computeDiff(a, b, { threshold: 30, mode: DIFF_MODE.PERCEPTUAL }).diffCount;
  const luma = computeDiff(a, b, { threshold: 30, mode: DIFF_MODE.LUMA }).diffCount;

  checkTrue('RGB 口径能测到纯绿变化', rgb > 0, `rgb=${rgb}`);
  checkTrue('感知口径能测到纯绿变化', per > 0, `perceptual=${per}`);
  // 绿通道在感知口径下权重更高，同样阈值下应比 RGB 均值口径更容易命中
  checkTrue('感知口径对纯绿变化更敏感', per >= rgb, `perceptual=${per} >= rgb=${rgb}`);
  // 反过来：纯色相变化几乎不改变亮度，luma 口径应当明显更迟钝
  checkTrue('亮度口径对纯色相变化迟钝', luma <= per, `luma=${luma} <= perceptual=${per}`);
}

console.log('\n─── 4. 忽略位移 ───');
{
  // B 相对 A 整体右移 1px。
  // 素材必须是高频的 —— 拿大色块来测会得出「几乎没变化」的假象，
  // 因为纯色区域平移后像素值本来就相同。这里用步进 40 的锯齿波，
  // 保证任意相邻像素差都大于阈值，平移才会真的"全变"。
  const a = solid(W, H, [0, 0, 0]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = (x * 40) % 256;
      const p = (y * W + x) * 4;
      a.data[p] = v; a.data[p + 1] = v; a.data[p + 2] = v;
    }
  }

  const b = solid(W, H, [0, 0, 0]);
  for (let y = 0; y < H; y++) {
    for (let x = 1; x < W; x++) {
      const src = (y * W + x - 1) * 4;
      const dst = (y * W + x) * 4;
      b.data[dst] = a.data[src];
      b.data[dst + 1] = a.data[src + 1];
      b.data[dst + 2] = a.data[src + 2];
      b.data[dst + 3] = 255;
    }
  }

  const raw = computeDiff(a, b, { threshold: 30, ignoreShift: 0 });
  const tolerant = computeDiff(a, b, { threshold: 30, ignoreShift: 1 });

  checkTrue(
    '位移 1px 时，不容错会大量误报',
    raw.diffCount > W * H * 0.5,
    `raw=${raw.diffCount} / 总像素=${W * H}`
  );
  checkTrue(
    '开启 ±1px 容错后误报基本消失',
    tolerant.diffCount < raw.diffCount * 0.05,
    `tolerant=${tolerant.diffCount} / raw=${raw.diffCount}`
  );
  checkTrue('容错救回的像素有计数', tolerant.filtered.shift > 0, `filtered.shift=${tolerant.filtered.shift}`);
}

console.log('\n─── 5. 抗锯齿过滤 ───');
{
  // 造一条对角灰阶过渡带：每个灰像素在 3×3 邻域里既有更暗的（黑）
  // 也有更亮的（白）邻居，正是抗锯齿像素的典型特征。
  const SIZE = 40;
  const makeDiag = (grayValue) => {
    const img = solid(SIZE, SIZE, [0, 0, 0]);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const s = x + y;
        const v = s < 36 ? 0 : s === 36 ? grayValue : 255;
        const p = (y * SIZE + x) * 4;
        img.data[p] = v; img.data[p + 1] = v; img.data[p + 2] = v;
      }
    }
    return img;
  };

  const a = makeDiag(128);
  const b = makeDiag(60);

  const off = computeDiff(a, b, { threshold: 30, mode: DIFF_MODE.PERCEPTUAL, antiAlias: false });
  const on = computeDiff(a, b, { threshold: 30, mode: DIFF_MODE.PERCEPTUAL, antiAlias: true });

  checkTrue('不开抗锯齿时，过渡带被判为差异', off.diffCount > 0, `off=${off.diffCount}`);
  checkTrue(
    '开启后过渡带被过滤掉',
    on.diffCount < off.diffCount * 0.5,
    `on=${on.diffCount} / off=${off.diffCount}`
  );
  checkTrue('抗锯齿过滤有计数', on.filtered.antiAlias > 0, `filtered.antiAlias=${on.filtered.antiAlias}`);

  // 对照组：硬边实心色块是真实改动，绝不能被抗锯齿逻辑吃掉
  const c = withRects(SIZE, SIZE, [0, 0, 0], [{ x0: 8, y0: 8, x1: 32, y1: 32, color: [255, 255, 255] }]);
  const d = solid(SIZE, SIZE, [0, 0, 0]);
  const hardOff = computeDiff(c, d, { threshold: 30, mode: DIFF_MODE.PERCEPTUAL, antiAlias: false });
  const hardOn = computeDiff(c, d, { threshold: 30, mode: DIFF_MODE.PERCEPTUAL, antiAlias: true });
  check('硬边色块不受抗锯齿过滤影响', hardOn.diffCount, hardOff.diffCount);
  check('硬边色块整体计入', hardOn.diffCount, (32 - 8) * (32 - 8));

  // 回归用例：大块纯色改动压在平滑渐变底图上。
  // 这是浏览器实测抓到的过度过滤 —— 渐变的明暗抖动只有 ±1 个灰阶（非零，
  // 躲得过 min === 0 的判断），配上 B 侧大色块的「同色邻居多」，
  // 会让色块内部整片被误判成抗锯齿，3600px 的色块只剩 2253px。
  {
    const S = 80;
    const bg = (img) => {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const p = (y * S + x) * 4;
          img.data[p] = 20 + Math.round((x / S) * 200);
          img.data[p + 1] = 20 + Math.round((y / S) * 200);
          img.data[p + 2] = 90;
        }
      }
      return img;
    };

    const bgA = bg(solid(S, S, [0, 0, 0]));
    const bgB = bg(solid(S, S, [0, 0, 0]));
    // 在 B 上盖一块 40×40 纯红
    for (let y = 20; y < 60; y++) {
      for (let x = 20; x < 60; x++) {
        const p = (y * S + x) * 4;
        bgB.data[p] = 255; bgB.data[p + 1] = 0; bgB.data[p + 2] = 0;
      }
    }

    const gOff = computeDiff(bgA, bgB, { threshold: 30, mode: DIFF_MODE.PERCEPTUAL, antiAlias: false });
    const gOn = computeDiff(bgA, bgB, { threshold: 30, mode: DIFF_MODE.PERCEPTUAL, antiAlias: true });

    check('渐变底图上的实心色块：不开抗锯齿时整块命中', gOff.diffCount, 40 * 40);
    check('渐变底图上的实心色块：开抗锯齿后仍整块命中（不被掏洞）', gOn.diffCount, 40 * 40);
  }
}

console.log('\n─── 6. 抗锯齿只在感知口径下生效 ───');
{
  const a = solid(W, H, [0, 0, 0]);
  const b = withRects(W, H, [0, 0, 0], [{ x0: 8, y0: 8, x1: 32, y1: 32, color: [255, 255, 255] }]);
  const rgbOn = computeDiff(a, b, { threshold: 30, mode: DIFF_MODE.RGB, antiAlias: true });
  check('RGB 口径下 antiAlias 开关不改变结果', rgbOn.filtered.antiAlias, 0);
}

console.log(`\n${'='.repeat(46)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
console.log('='.repeat(46));
process.exit(failed === 0 ? 0 : 1);
