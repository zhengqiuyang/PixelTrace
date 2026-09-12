import { useCallback, useRef, useState } from 'react';
import { isSupportedImage } from '../utils/batchPairing.js';

/**
 * 文件夹选择器（批量对比用）
 *
 * 两条入口：
 *   · 点击 → <input type="file" webkitdirectory>，浏览器原生的「选择文件夹」
 *   · 拖放 → DataTransferItem.webkitGetAsEntry() 递归读取目录树
 *
 * 拖放那条要递归读目录，因为 DataTransfer.files 在拖文件夹时
 * **只给出目录本身、不含内容**（各浏览器行为还不一致），
 * 只有走 webkitGetAsEntry 才能拿到里面的文件。
 */

/** 递归读一个目录条目下的全部文件 */
async function readDirectoryEntry(dirEntry, pathPrefix = '') {
  const reader = dirEntry.createReader();
  const out = [];

  // readEntries 一次最多返回 100 条，必须循环读到空为止 ——
  // 只调一次的话超过 100 个文件的目录会被静默截断
  const readBatch = () => new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });

  for (;;) {
    const batch = await readBatch();
    if (!batch.length) break;
    for (const entry of batch) {
      const rel = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        out.push(...await readDirectoryEntry(entry, rel));
      } else if (entry.isFile) {
        const file = await new Promise((resolve, reject) => {
          entry.file(resolve, reject);
        });
        out.push({ file, rel });
      }
    }
  }

  return out;
}

/**
 * 把拖放的文件整理成「带 webkitRelativePath 的 File 列表」，
 * 让后续配对逻辑对两条入口一视同仁。
 *
 * File 的 webkitRelativePath 是只读的，没法直接赋值，
 * 所以这里用一个同形状的包装对象 —— 配对逻辑只读
 * name / type / webkitRelativePath / size 这几个属性。
 */
function wrapEntries(entries, rootName) {
  return entries
    .filter(({ file }) => isSupportedImage(file))
    .map(({ file, rel }) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      webkitRelativePath: `${rootName}/${rel}`,
      _file: file,
      // 解码时要用真正的 File 对象
      get raw() { return file; },
    }));
}

export default function BatchUploader({ label, side, files, onFiles }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  const handleInput = useCallback((e) => {
    const list = Array.from(e.target.files ?? []);
    if (list.length) {
      setError('');
      onFiles(list);
    }
    // 清空 value，否则连续选同一个目录不会再触发 change
    e.target.value = '';
  }, [onFiles]);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);

    const items = Array.from(e.dataTransfer?.items ?? []);
    const dirs = items
      .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
      .filter(Boolean);

    if (dirs.length === 0) {
      setError('未识别到文件夹，请拖入整个文件夹');
      return;
    }

    setReading(true);
    setError('');
    try {
      const all = [];
      for (const dir of dirs) {
        if (dir.isDirectory) {
          const entries = await readDirectoryEntry(dir);
          all.push(...wrapEntries(entries, dir.name));
        } else if (dir.isFile) {
          const file = await new Promise((resolve, reject) => dir.file(resolve, reject));
          if (isSupportedImage(file)) {
            all.push({
              name: file.name,
              type: file.type,
              size: file.size,
              webkitRelativePath: `${dir.name}/${file.name}`,
              _file: file,
            });
          }
        }
      }
      if (all.length === 0) {
        setError('这个文件夹里没有可比较的图片');
      } else {
        onFiles(all);
      }
    } catch (err) {
      console.error('读取拖入的文件夹失败:', err);
      setError('读取文件夹失败，请改用「选择文件夹」');
    } finally {
      setReading(false);
    }
  }, [onFiles]);

  const folderName = files?.length
    ? (files[0].webkitRelativePath || '').split('/')[0]
    : '';

  return (
    <div
      className={`batch-picker ${dragOver ? 'drag-over' : ''} ${files?.length ? 'has-files' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="batch-picker-head">
        <span className="batch-picker-label">{label}</span>
        {files?.length > 0 && (
          <span className="batch-picker-count">{files.length} 张</span>
        )}
      </div>

      {files?.length > 0 ? (
        <div className="batch-picker-body">
          <div className="batch-picker-folder" title={folderName}>{folderName || '(未命名)'}</div>
          <button
            type="button"
            className="pixel-btn batch-picker-reset"
            onClick={() => onFiles(null)}
          >
            重新选择
          </button>
        </div>
      ) : (
        <div className="batch-picker-body">
          <p className="batch-picker-hint">
            {reading ? '正在读取文件夹…' : '把文件夹拖到这里，或'}
          </p>
          {!reading && (
            <button
              type="button"
              className="pixel-btn accent"
              onClick={() => inputRef.current?.click()}
            >
              选择文件夹
            </button>
          )}
        </div>
      )}

      {error && <p className="batch-picker-error">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        className="batch-picker-input"
        onChange={handleInput}
        aria-label={`选择${label}的文件夹`}
        data-side={side}
      />
    </div>
  );
}
