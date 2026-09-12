/**
 * 文件夹配对的已知答案测试。
 *
 * 配对是整个批量功能的入口 —— 配错了后面所有统计都是错的，
 * 而且错得很隐蔽（报告里会显示「这张图变了」，实际只是配错了对）。
 * 因此每一轮匹配规则、每一种歧义都要有明确断言。
 *
 * 运行: npm run test-batch
 */

const { pairFolders, toRelativePath, isSupportedImage } = await import('../src/utils/batchPairing.js');

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

/** 造一个「像 File 一样」的对象 —— 配对只读 name / type / webkitRelativePath */
const f = (root, rel, type = 'image/png') => ({
  name: rel.split('/').pop(),
  type,
  webkitRelativePath: rel ? `${root}/${rel}` : root,
  size: 1000,
});

// ─── 1. 路径提取 ───

console.log('\n─── 1. 相对路径提取 ───');
check('剥掉顶层目录名', toRelativePath(f('v1', 'a.png')), 'a.png');
check('保留子目录层级', toRelativePath(f('v1', 'sub/deep/a.png')), 'sub/deep/a.png');
check('没有 webkitRelativePath 时回退到文件名',
  toRelativePath({ name: 'a.png', type: 'image/png' }), 'a.png');
check('顶层目录下直接是文件', toRelativePath(f('v1', '')), 'v1');

console.log('\n─── 2. 图片格式识别 ───');
check('PNG 按 MIME 识别', isSupportedImage({ name: 'x', type: 'image/png' }), true);
check('JPG 按扩展名识别（MIME 为空）',
  isSupportedImage({ name: 'a.JPG', type: '' }), true);
check('.DS_Store 被排除', isSupportedImage({ name: '.DS_Store', type: '' }), false);
check('文本文件被排除', isSupportedImage({ name: 'readme.txt', type: 'text/plain' }), false);
check('无扩展名文件被排除', isSupportedImage({ name: 'LICENSE', type: '' }), false);

// ─── 3. 第 1 轮：相对路径一致 ───

console.log('\n─── 3. 第 1 轮 · 相对路径一致 ───');
{
  const A = [f('v1', 'a.png'), f('v1', 'sub/b.png'), f('v1', 'sub/deep/c.png')];
  const B = [f('v2', 'a.png'), f('v2', 'sub/b.png'), f('v2', 'sub/deep/c.png')];
  const r = pairFolders(A, B);
  check('全部配上', r.stats.paired, 3);
  check('全部走路径匹配', r.stats.pairedByPath, 3);
  check('无单边独有', r.stats.onlyACount + r.stats.onlyBCount, 0);
  check('无歧义', r.stats.ambiguousCount, 0);
  ok('子目录路径保留正确', r.pairs[2].relA === 'sub/deep/c.png', r.pairs[2].relA);
  check('顶层目录名不同也能配（v1 vs v2）', r.pairs[0].fileA.webkitRelativePath, 'v1/a.png');
}

console.log('\n─── 4. 大小写不敏感 ───');
{
  const r = pairFolders([f('v1', 'Logo.PNG')], [f('v2', 'logo.png')]);
  check('大小写不同视为同一路径', r.stats.paired, 1);
  check('记录为路径匹配', r.pairs[0].matchKind, 'path');
}

// ─── 5. 第 2 轮：仅文件名一致 ───

console.log('\n─── 5. 第 2 轮 · 仅文件名一致 ───');
{
  const A = [f('v1', 'screens/home.png'), f('v1', 'screens/detail.png')];
  const B = [f('v2', 'home.png'), f('v2', 'detail.png')];
  const r = pairFolders(A, B);
  check('目录层级不同也能配', r.stats.paired, 2);
  check('记为文件名匹配', r.stats.pairedByName, 2);
  ok('配对依据标记正确', r.pairs.every((p) => p.matchKind === 'name'));
}

// ─── 6. 第 3 轮：扩展名不同 ───

console.log('\n─── 6. 第 3 轮 · 扩展名不同 ───');
{
  const r = pairFolders([f('v1', 'hero.png')], [f('v2', 'hero.jpg', 'image/jpeg')]);
  check('a.png ↔ a.jpg 能配上', r.stats.paired, 1);
  check('记为扩展名匹配', r.pairs[0].matchKind, 'stem');
}

console.log('\n─── 7. 匹配优先级 ───');
{
  // 路径能配上时，不应退化成文件名匹配
  const A = [f('v1', 'x/a.png'), f('v1', 'y/b.png')];
  const B = [f('v2', 'x/a.png'), f('v2', 'y/b.png')];
  const r = pairFolders(A, B);
  check('优先按路径', r.stats.pairedByPath, 2);
  check('不产生文件名匹配', r.stats.pairedByName, 0);
}

// ─── 8. 单边独有 ───

console.log('\n─── 8. 单边独有 ───');
{
  const A = [f('v1', 'a.png'), f('v1', 'only-a.png')];
  const B = [f('v2', 'a.png'), f('v2', 'only-b.png')];
  const r = pairFolders(A, B);
  check('配上 1 对', r.stats.paired, 1);
  check('仅 A 有 1 个', r.stats.onlyACount, 1);
  check('仅 B 有 1 个', r.stats.onlyBCount, 1);
  check('仅 A 有的文件名正确', r.onlyA[0].rel, 'only-a.png');
  check('仅 B 有的文件名正确', r.onlyB[0].rel, 'only-b.png');
}

// ─── 9. 歧义必须报出，不能猜 ───

console.log('\n─── 9. 歧义处理 ───');
{
  // A 侧有两个同名 a.png（不同子目录），B 侧只有一个 → 无法确定配哪个
  const A = [f('v1', 'x/a.png'), f('v1', 'y/a.png')];
  const B = [f('v2', 'a.png')];
  const r = pairFolders(A, B);
  check('歧义组不产生配对', r.stats.paired, 0);
  check('歧义被记录', r.stats.ambiguousCount, 1);
  ok('歧义里带上全部候选路径',
    r.ambiguous[0].relA.length === 2 && r.ambiguous[0].relB.length === 1,
    JSON.stringify(r.ambiguous[0].relA));
  check('歧义涉及的 A 侧文件仍算单边独有', r.stats.onlyACount, 2);
  check('歧义涉及的 B 侧文件仍算单边独有', r.stats.onlyBCount, 1);
}

console.log('\n─── 10. 路径唯一时不受同名干扰 ───');
{
  // 两边都有 x/a.png 和 y/a.png —— 路径全中，不应产生歧义
  const A = [f('v1', 'x/a.png'), f('v1', 'y/a.png')];
  const B = [f('v2', 'x/a.png'), f('v2', 'y/a.png')];
  const r = pairFolders(A, B);
  check('两条都按路径配上', r.stats.paired, 2);
  check('无歧义', r.stats.ambiguousCount, 0);
}

// ─── 11. 非图片文件 ───

console.log('\n─── 11. 非图片文件 ───');
{
  const A = [f('v1', 'a.png'), f('v1', '.DS_Store', ''), f('v1', 'notes.txt', 'text/plain')];
  const B = [f('v2', 'a.png'), f('v2', '.DS_Store', '')];
  const r = pairFolders(A, B);
  check('只配对图片', r.stats.paired, 1);
  check('统计里的 A 总数只算图片', r.stats.totalA, 1);
  check('忽略的非图片数被记录', r.stats.ignoredCount, 3);
}

// ─── 12. 边界 ───

console.log('\n─── 12. 边界情况 ───');
{
  const r = pairFolders([], []);
  check('两边都空：0 对', r.stats.paired, 0);
  check('两边都空：无单边', r.stats.onlyACount + r.stats.onlyBCount, 0);

  const r2 = pairFolders([f('v1', 'a.png')], []);
  check('B 为空：全部算仅 A 有', r2.stats.onlyACount, 1);
  check('B 为空：0 对', r2.stats.paired, 0);

  const r3 = pairFolders(null, undefined);
  check('传 null/undefined 不崩', r3.stats.paired, 0);
}

// ─── 13. 排序稳定性 ───

console.log('\n─── 13. 排序 ───');
{
  const A = [f('v1', 'c.png'), f('v1', 'a.png'), f('v1', 'b.png')];
  const B = [f('v2', 'a.png'), f('v2', 'b.png'), f('v2', 'c.png')];
  const r = pairFolders(A, B);
  check('配对结果按路径排序', r.pairs.map((p) => p.relA).join(','), 'a.png,b.png,c.png');
}

console.log(`\n${'='.repeat(46)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
console.log('='.repeat(46));
process.exit(failed === 0 ? 0 : 1);
