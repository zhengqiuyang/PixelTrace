/**
 * 批量结果的归类、合并与汇总。
 *
 * 状态判定分三档，而不是简单的「有差 / 无差」：
 *
 *   identical   diffCount === 0            完全一致
 *   noise       diffCount > 0 且 regionCount === 0
 *                                          有像素差，但没有任何一块达到
 *                                          「最小区域面积」，是压缩噪声/
 *                                          亚像素抖动的特征
 *   changed     regionCount > 0            形成了达标区域，是真差异
 *
 * 分「noise」这一档很关键：否则一张 2000×2000 的截图里一个像素的抗锯齿
 * 差异就会让报告显示「有差异」，几十张下来全是噪声，报告就没法看了。
 * 而且这个判定复用了用户已经调好的 threshold / minArea，不需要再加旋钮。
 */

export const STATUS = Object.freeze({
  IDENTICAL: 'identical',
  NOISE: 'noise',
  CHANGED: 'changed',
  ONLY_A: 'only-a',
  ONLY_B: 'only-b',
  ERROR: 'error',
  // 尚未算到（批量运行中）。必须与 ERROR 区分开，
  // 否则进度到一半时列表里会有一堆「计算失败」，看着像出了大事。
  PENDING: 'pending',
});

export const STATUS_LABEL = Object.freeze({
  [STATUS.IDENTICAL]: '一致',
  [STATUS.NOISE]: '微差',
  [STATUS.CHANGED]: '有差异',
  [STATUS.ONLY_A]: '仅原始有',
  [STATUS.ONLY_B]: '仅修改后有',
  [STATUS.ERROR]: '计算失败',
  [STATUS.PENDING]: '待计算',
});

/** 给一对计算结果定状态 */
export function classifyPair(result) {
  if (!result) return STATUS.ERROR;
  if (result.diffCount === 0) return STATUS.IDENTICAL;
  if ((result.regionCount ?? 0) === 0) return STATUS.NOISE;
  return STATUS.CHANGED;
}

/**
 * 把配对结果与计算结果合并成展示用的行。
 *
 * @param {object} pairing pairFolders() 的返回值
 * @param {Map<string, object>} resultsByKey 已算完的结果，key 为 pair.key
 * @returns {Array<object>} 行列表（已按「越需要关注越靠前」排序）
 */
export function buildRows(pairing, resultsByKey) {
  const rows = [];

  for (const pair of pairing.pairs) {
    const r = resultsByKey.get(pair.key);
    // 没有结果且没有 error 字段 → 还没算到；有 error 字段才是真失败
    const status = r
      ? (r.error ? STATUS.ERROR : classifyPair(r))
      : STATUS.PENDING;
    rows.push({
      kind: 'pair',
      key: pair.key,
      relA: pair.relA,
      relB: pair.relB,
      matchKind: pair.matchKind,
      fileA: pair.fileA,
      fileB: pair.fileB,
      status,
      error: r?.error ?? null,
      // 计算失败时下面的字段全为 null，表格里显示为「—」
      result: r ?? null,
      diffCount: r?.diffCount ?? null,
      diffPercentage: r?.diffPercentage ?? null,
      regionCount: r?.regionCount ?? null,
      maxDeltaE: r?.maxDeltaE ?? null,
      meanDeltaE: r?.meanDeltaE ?? null,
      mse: r?.mse ?? null,
      psnr: r?.psnr ?? null,
      ssim: r?.ssim ?? null,
      sizeMismatch: r?.sizeMismatch ?? false,
      width: r?.width ?? null,
      height: r?.height ?? null,
      sizeA: r?.sizeA ?? null,
      sizeB: r?.sizeB ?? null,
      thumbA: r?.thumbA ?? null,
      thumbB: r?.thumbB ?? null,
      thumbDiff: r?.thumbDiff ?? null,
    });
  }

  for (const e of pairing.onlyA) {
    // 单边文件也算过缩略图（key 形如 `A::sub/a.png`），取不到就留空
    const extra = resultsByKey.get(`A::${e.rel}`);
    rows.push({
      kind: 'only-a',
      key: `A::${e.rel}`,
      relA: e.rel,
      relB: null,
      matchKind: null,
      fileA: e.file,
      fileB: null,
      status: STATUS.ONLY_A,
      error: extra?.error ?? null,
      result: null,
      diffCount: null,
      diffPercentage: null,
      regionCount: null,
      maxDeltaE: null,
      meanDeltaE: null,
      mse: null,
      psnr: null,
      ssim: null,
      sizeMismatch: false,
      width: null,
      height: null,
      sizeA: null,
      sizeB: null,
      thumbA: extra?.thumbA ?? null,
      thumbB: null,
      thumbDiff: null,
    });
  }

  for (const e of pairing.onlyB) {
    const extra = resultsByKey.get(`B::${e.rel}`);
    rows.push({
      kind: 'only-b',
      key: `B::${e.rel}`,
      relA: null,
      relB: e.rel,
      matchKind: null,
      fileA: null,
      fileB: e.file,
      status: STATUS.ONLY_B,
      error: extra?.error ?? null,
      result: null,
      diffCount: null,
      diffPercentage: null,
      regionCount: null,
      maxDeltaE: null,
      meanDeltaE: null,
      mse: null,
      psnr: null,
      ssim: null,
      sizeMismatch: false,
      width: null,
      height: null,
      sizeA: null,
      sizeB: null,
      thumbA: null,
      thumbB: extra?.thumbB ?? null,
      thumbDiff: null,
    });
  }

  // 排序：有差异 → 计算失败 → 微差 → 仅单边 → 一致 → 待计算
  // 组内按差异占比降序（没有占比的按路径），让「最该看的」浮到最上面
  const order = {
    [STATUS.CHANGED]: 0,
    [STATUS.ERROR]: 1,
    [STATUS.NOISE]: 2,
    [STATUS.ONLY_A]: 3,
    [STATUS.ONLY_B]: 3,
    [STATUS.IDENTICAL]: 4,
    [STATUS.PENDING]: 5,
  };

  return rows.sort((x, y) => {
    const d = (order[x.status] ?? 9) - (order[y.status] ?? 9);
    if (d !== 0) return d;
    const dp = (y.diffPercentage ?? -1) - (x.diffPercentage ?? -1);
    if (dp !== 0) return dp;
    return (x.relA ?? x.relB).localeCompare(y.relA ?? y.relB);
  });
}

/** 汇总统计 */
export function summarize(rows) {
  const by = (s) => rows.filter((r) => r.status === s).length;

  const compared = rows.filter((r) => r.kind === 'pair');
  const totalDiffPixels = compared.reduce((s, r) => s + (r.diffCount ?? 0), 0);

  const withPct = compared.filter((r) => typeof r.diffPercentage === 'number');
  const avgDiffPercentage = withPct.length
    ? withPct.reduce((s, r) => s + r.diffPercentage, 0) / withPct.length
    : 0;

  const changed = compared.filter((r) => r.status === STATUS.CHANGED);
  const worst = changed.slice().sort((a, b) => b.diffPercentage - a.diffPercentage)[0] ?? null;

  return {
    total: rows.length,
    compared: compared.length,
    identical: by(STATUS.IDENTICAL),
    noise: by(STATUS.NOISE),
    changed: by(STATUS.CHANGED),
    onlyA: by(STATUS.ONLY_A),
    onlyB: by(STATUS.ONLY_B),
    error: by(STATUS.ERROR),
    pending: by(STATUS.PENDING),
    totalDiffPixels,
    avgDiffPercentage,
    worst,
  };
}

/** 表格与报告共用的筛选档位 */
export const FILTERS = Object.freeze([
  { key: 'attention', label: '需要关注', test: (r) => r.status === STATUS.CHANGED },
  { key: 'changed', label: '有差异', test: (r) => r.status === STATUS.CHANGED || r.status === STATUS.NOISE },
  { key: 'only', label: '仅单边有', test: (r) => r.status === STATUS.ONLY_A || r.status === STATUS.ONLY_B },
  { key: 'error', label: '失败', test: (r) => r.status === STATUS.ERROR },
  { key: 'all', label: '全部', test: () => true },
]);

/** 表格与报告共用的排序档位 */
export const SORTS = Object.freeze([
  { key: 'severity', label: '按严重度', cmp: null }, // 默认顺序即严重度顺序
  { key: 'diff-desc', label: '差异占比 高→低', cmp: (a, b) => (b.diffPercentage ?? -1) - (a.diffPercentage ?? -1) },
  { key: 'diff-asc', label: '差异占比 低→高', cmp: (a, b) => (a.diffPercentage ?? -1) - (b.diffPercentage ?? -1) },
  { key: 'deltae-desc', label: '最大色差 高→低', cmp: (a, b) => (b.maxDeltaE ?? -1) - (a.maxDeltaE ?? -1) },
  { key: 'path', label: '按路径', cmp: (a, b) => (a.relA ?? a.relB).localeCompare(b.relA ?? b.relB) },
]);

/** 应用筛选 + 排序（返回新数组，不改原数组） */
export function applyFilterSort(rows, filterKey, sortKey) {
  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0];
  const sort = SORTS.find((s) => s.key === sortKey) ?? SORTS[0];
  const out = rows.filter(filter.test);
  if (sort.cmp) out.sort(sort.cmp);
  return out;
}
