/**
 * 文件夹配对 —— 把两个目录里的图片按「同一张图的新旧版本」配成对。
 *
 * 三轮匹配，越靠后越宽松，每轮都记录 matchKind 以便在报告里显示配对依据：
 *
 *   1. path  相对路径完全相同（子目录结构一致）
 *   2. name  仅文件名相同（忽略目录层级）
 *   3. stem  去掉扩展名后相同（a.png ↔ a.jpg，同名不同格式）
 *
 * 歧义一律不猜：若某一轮里一个候选对应到多个同名文件，
 * 整组丢进 ambiguous 并原样报出，而不是随便挑一个 —— 挑错了会让报告
 * 出现「这张图变了」的假结论，比不配更糟。
 */

import { SUPPORTED_EXTENSIONS, SUPPORTED_FORMATS } from './constants.js';

/**
 * 取用于配对的相对路径。
 *
 * webkitRelativePath 形如 `myfolder/sub/a.png`，首段是用户选中的那个目录名。
 * 两边的目录名通常不同（`v1` vs `v2`），不剥掉首段就永远配不上。
 */
export function toRelativePath(file) {
  const raw = file.webkitRelativePath || file.name || '';
  const parts = raw.split('/').filter(Boolean);
  if (parts.length === 0) return '';
  return parts.length > 1 ? parts.slice(1).join('/') : parts[0];
}

/** 是否是可比较的图片文件 */
export function isSupportedImage(file) {
  if (!file) return false;
  if (SUPPORTED_FORMATS.includes(file.type)) return true;
  const name = (file.name || '').toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * 取真正可解码的 Blob。
 *
 * 拖放入口给的是带 `raw` 的包装对象 —— File 的 webkitRelativePath 是只读的，
 * 没法直接赋值，只能另起一个同形状对象来承载相对路径。
 * 但 createImageBitmap / FileReader 都要求参数是货真价实的 Blob，
 * 包装对象传进去会直接抛 TypeError，所以配对完成前必须换成真身。
 *
 * 拿不到 raw/_file 就原样返回：上传入口给的就是 File，
 * 测试里的夹具是普通对象，两条路都不该被这层改写。
 */
export function toBlob(file) {
  if (!file) return null;
  return file.raw ?? file._file ?? file;
}

const lower = (s) => s.toLowerCase();

/** `sub/A.PNG` → `sub/a` */
function stemOf(relPath) {
  const i = relPath.lastIndexOf('.');
  const slash = relPath.lastIndexOf('/');
  // 只剥最后一段里的点，避免把 `a.b/c` 的目录点也当成扩展名
  const noExt = i > slash ? relPath.slice(0, i) : relPath;
  return lower(noExt);
}

/** `sub/A.PNG` → `a.png` */
function baseNameOf(relPath) {
  const i = relPath.lastIndexOf('/');
  return lower(i >= 0 ? relPath.slice(i + 1) : relPath);
}

/**
 * 建条目列表。**条目对象只建一次**，后续用对象引用追踪「已配对」，
 * 因此不能在任何地方重新构造等价的条目对象。
 *
 * file 在这里就换成真 Blob（见 toBlob）—— 这是全流程唯一的换手点，
 * 下游 createImageBitmap / FileReader / loadImageFromFile 都直接吃它。
 */
function toEntries(files) {
  const out = [];
  // 默认参数只对 undefined 生效，null 会穿透进来，这里显式兜住
  if (!Array.isArray(files)) return out;
  for (const file of files) {
    if (!isSupportedImage(file)) continue;
    const rel = toRelativePath(file);
    if (!rel) continue;
    out.push({ rel, file: toBlob(file) });
  }
  return out;
}

/** 按 key 建索引，value 是条目数组（同 key 多条目 = 歧义） */
function groupBy(entries, keyOf) {
  const map = new Map();
  for (const e of entries) {
    const k = keyOf(e.rel);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return map;
}

/**
 * @param {File[]} filesA
 * @param {File[]} filesB
 * @returns {{
 *   pairs: Array<{key,relA,relB,fileA,fileB,matchKind}>,
 *   onlyA: Array<{rel,file}>,
 *   onlyB: Array<{rel,file}>,
 *   ambiguous: Array<{stage,key,relA:string[],relB:string[]}>,
 *   ignoredCount: number,
 *   stats: object,
 * }}
 */
export function pairFolders(filesA, filesB) {
  const listA = Array.isArray(filesA) ? filesA : [];
  const listB = Array.isArray(filesB) ? filesB : [];

  const entriesA = toEntries(listA);
  const entriesB = toEntries(listB);
  const ignoredCount = (listA.length - entriesA.length) + (listB.length - entriesB.length);

  const pairs = [];
  const ambiguous = [];
  const takenA = new Set();
  const takenB = new Set();

  /** 某侧候选多于一个 → 无法唯一确定，记歧义并放弃这一轮 */
  const tryMatch = (candA, candB, stage, key) => {
    if (candA.length !== 1 || candB.length !== 1) {
      ambiguous.push({
        stage,
        key,
        relA: candA.map((e) => e.rel),
        relB: candB.map((e) => e.rel),
      });
      return;
    }
    const a = candA[0];
    const b = candB[0];
    takenA.add(a);
    takenB.add(b);
    pairs.push({
      key: `${a.rel}||${b.rel}`,
      relA: a.rel,
      relB: b.rel,
      fileA: a.file,
      fileB: b.file,
      matchKind: stage,
    });
  };

  // ── 第 1 轮：相对路径完全相同 ──
  const idxPathA = groupBy(entriesA, lower);
  const idxPathB = groupBy(entriesB, lower);
  for (const k of idxPathA.keys()) {
    if (idxPathB.has(k)) tryMatch(idxPathA.get(k), idxPathB.get(k), 'path', k);
  }

  const leftA = () => entriesA.filter((e) => !takenA.has(e));
  const leftB = () => entriesB.filter((e) => !takenB.has(e));

  // ── 第 2 轮：仅文件名相同 ──
  const idxNameA = groupBy(leftA(), baseNameOf);
  const idxNameB = groupBy(leftB(), baseNameOf);
  for (const k of idxNameA.keys()) {
    if (idxNameB.has(k)) tryMatch(idxNameA.get(k), idxNameB.get(k), 'name', k);
  }

  // ── 第 3 轮：去扩展名后相同（a.png ↔ a.jpg）──
  const idxStemA = groupBy(leftA(), stemOf);
  const idxStemB = groupBy(leftB(), stemOf);
  for (const k of idxStemA.keys()) {
    if (idxStemB.has(k)) tryMatch(idxStemA.get(k), idxStemB.get(k), 'stem', k);
  }

  // ── 剩下的就是单边独有 ──
  const onlyA = leftA().slice().sort((x, y) => x.rel.localeCompare(y.rel));
  const onlyB = leftB().slice().sort((x, y) => x.rel.localeCompare(y.rel));

  return {
    pairs: pairs.slice().sort((x, y) => x.relA.localeCompare(y.relA)),
    onlyA,
    onlyB,
    ambiguous,
    ignoredCount,
    stats: {
      totalA: entriesA.length,
      totalB: entriesB.length,
      paired: pairs.length,
      pairedByPath: pairs.filter((p) => p.matchKind === 'path').length,
      pairedByName: pairs.filter((p) => p.matchKind === 'name').length,
      pairedByStem: pairs.filter((p) => p.matchKind === 'stem').length,
      onlyACount: onlyA.length,
      onlyBCount: onlyB.length,
      ambiguousCount: ambiguous.length,
      ignoredCount,
    },
  };
}

/** 配对依据的中文说明，供 UI 与报告共用 */
export const MATCH_KIND_LABEL = Object.freeze({
  path: '路径一致',
  name: '仅文件名一致',
  stem: '扩展名不同',
});
