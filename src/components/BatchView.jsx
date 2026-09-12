import { useCallback, useMemo, useState } from 'react';
import { useAppContext } from '../hooks/useAppContext.js';
import { useBatchDiff } from '../hooks/useBatchDiff.js';
import { useToast } from '../hooks/useToast.js';
import { pairFolders } from '../utils/batchPairing.js';
import { buildRows, summarize } from '../utils/batchResults.js';
import { buildBatchReportHtml, buildBatchReportFilename, buildBatchCsv } from '../utils/batchReport.js';
import { downloadText } from '../utils/exporters.js';
import BatchUploader from './BatchUploader.jsx';
import BatchResults from './BatchResults.jsx';
import SettingsPanel from './SettingsPanel.jsx';

/**
 * 文件夹批量对比。
 *
 * 三步：选两个文件夹 → 逐对算差异 → 出结果表与报告。
 * 检测口径复用全局 settings（与单对视图同一套），因此这里也挂了设置面板 ——
 * 否则批量跑完发现阈值不合适，只能退回单对模式去调，很别扭。
 */
export default function BatchView({ onExit, onOpenPair }) {
  const { state } = useAppContext();
  const { settings } = state;
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const [filesA, setFilesA] = useState(null);
  const [filesB, setFilesB] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const batch = useBatchDiff();
  const { reset: resetBatch } = batch;

  /**
   * 换文件夹必须连结果一起清掉。
   *
   * 结果的键是 `relA||relB`。如果只换文件夹不清结果，
   * 新旧两个文件夹里同名的那几张会**撞上同一个键**，
   * 于是表格里显示的是上一个文件夹算出来的数字 —— 数据是错的，
   * 但界面上完全看不出来。宁可让用户重跑，也不能给错的数。
   *
   * 顺带也解决了另一个问题：清空一侧后 resultsByKey 还留着旧值，
   * 结果面板会以「全 0 + 还没有结果」的形式挂在那里，看着像坏了。
   */
  const handleFilesA = useCallback((files) => {
    resetBatch();
    setFilesA(files);
  }, [resetBatch]);

  const handleFilesB = useCallback((files) => {
    resetBatch();
    setFilesB(files);
  }, [resetBatch]);

  const pairing = useMemo(
    () => (filesA?.length && filesB?.length ? pairFolders(filesA, filesB) : null),
    [filesA, filesB]
  );

  const rows = useMemo(
    () => (pairing ? buildRows(pairing, batch.resultsByKey) : []),
    [pairing, batch.resultsByKey]
  );

  const summary = useMemo(() => summarize(rows), [rows]);

  // 也要看 pairing：没有配对就没有结果可言，否则清空文件夹后会留下一个全 0 的面板
  const hasResults = !!pairing && batch.resultsByKey.size > 0;

  const handleRun = useCallback(() => {
    if (!pairing) return;
    if (pairing.stats.paired === 0 && pairing.stats.onlyACount === 0 && pairing.stats.onlyBCount === 0) {
      toastError('两个文件夹里没有可比较的图片');
      return;
    }
    if (pairing.stats.paired === 0) {
      toastInfo('没有可配对的图片，只统计单边独有文件');
    }
    batch.run(pairing, settings);
  }, [pairing, batch, settings, toastError, toastInfo]);

  const handleOpenPair = useCallback((row) => {
    if (row.kind !== 'pair' || !row.fileA || !row.fileB) return;
    onOpenPair?.(row);
  }, [onOpenPair]);

  const reportMeta = useMemo(() => ({
    labelA: filesA?.[0] ? (filesA[0].webkitRelativePath || '').split('/')[0] : '',
    labelB: filesB?.[0] ? (filesB[0].webkitRelativePath || '').split('/')[0] : '',
    ambiguous: pairing?.ambiguous ?? [],
    ignoredCount: pairing?.ignoredCount ?? 0,
  }), [filesA, filesB, pairing]);

  const handleExportReport = useCallback(() => {
    try {
      const html = buildBatchReportHtml({ rows, summary, settings, meta: reportMeta });
      downloadText(
        html,
        buildBatchReportFilename(reportMeta.labelA || 'report'),
        'text/html;charset=utf-8'
      );
      toastSuccess('已导出 HTML 报告');
    } catch (err) {
      console.error('生成报告失败:', err);
      toastError('生成报告失败，请重试');
    }
  }, [rows, summary, settings, reportMeta, toastSuccess, toastError]);

  const handleExportCsv = useCallback(() => {
    try {
      downloadText(
        buildBatchCsv(rows),
        buildBatchReportFilename(reportMeta.labelA || 'report', 'csv'),
        'text/csv;charset=utf-8'
      );
      toastSuccess('已导出 CSV');
    } catch (err) {
      console.error('生成 CSV 失败:', err);
      toastError('生成 CSV 失败，请重试');
    }
  }, [rows, reportMeta, toastSuccess, toastError]);

  const progressPercent = batch.total > 0
    ? Math.round((batch.done / batch.total) * 100)
    : 0;

  return (
    <div className="batch-root">
      <div className="batch-toolbar">
        <button className="pixel-btn" onClick={onExit}>
          ← 返回单对对比
        </button>
        <span className="batch-title">文件夹批量对比</span>
        <div className="batch-toolbar-spacer" />
        <button className="pixel-btn" onClick={() => setSettingsOpen(true)}>
          ≡ 设置
        </button>
      </div>

      <div className="batch-pickers">
        <BatchUploader
          label="原始文件夹"
          side="left"
          files={filesA}
          onFiles={handleFilesA}
        />
        <div className="batch-pickers-arrow" aria-hidden="true">VS</div>
        <BatchUploader
          label="修改后文件夹"
          side="right"
          files={filesB}
          onFiles={handleFilesB}
        />
      </div>

      {pairing && (
        <div className="batch-pairing">
          <div className="batch-pairing-line">
            可配对 <b>{pairing.stats.paired}</b> 对
            {pairing.stats.pairedByPath > 0 && `（路径一致 ${pairing.stats.pairedByPath}）`}
            {pairing.stats.pairedByName > 0 && `（仅文件名一致 ${pairing.stats.pairedByName}）`}
            {pairing.stats.pairedByStem > 0 && `（扩展名不同 ${pairing.stats.pairedByStem}）`}
            {pairing.stats.onlyACount > 0 && ` · 仅原始有 ${pairing.stats.onlyACount}`}
            {pairing.stats.onlyBCount > 0 && ` · 仅修改后有 ${pairing.stats.onlyBCount}`}
            {pairing.stats.ignoredCount > 0 && ` · 已忽略 ${pairing.stats.ignoredCount} 个非图片文件`}
          </div>

          {pairing.stats.ambiguousCount > 0 && (
            <div className="batch-warn">
              ⚠ 有 {pairing.stats.ambiguousCount} 组文件存在多个同名候选，无法确定配对关系，
              已按「仅单边有」处理，未参与差异计算。请检查目录结构。
            </div>
          )}

          <div className="batch-run-row">
            <button
              className="pixel-btn accent"
              onClick={handleRun}
              disabled={batch.running}
            >
              {batch.running ? '对比中…' : hasResults ? '重新对比' : '开始对比'}
            </button>
            {batch.running && (
              <button className="pixel-btn" onClick={batch.cancel}>
                取消
              </button>
            )}
            {!batch.running && hasResults && (
              <button className="pixel-btn" onClick={batch.reset}>
                清空结果
              </button>
            )}
          </div>
        </div>
      )}

      {batch.running && (
        <div className="batch-progress">
          <div className="batch-progress-bar">
            <div className="batch-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="batch-progress-text">
            第 {Math.min(batch.done + 1, batch.total)} / {batch.total} 张
            {batch.current && <span className="batch-progress-file">{batch.current}</span>}
            {batch.currentPercent > 0 && <span>{batch.currentPercent}%</span>}
          </div>
        </div>
      )}

      {batch.canceled && !batch.running && (
        <p className="batch-note">已取消，下面是已完成部分的结果。</p>
      )}

      {batch.fatal && <p className="batch-error">{batch.fatal}</p>}

      {hasResults && (
        <BatchResults
          rows={rows}
          summary={summary}
          running={batch.running}
          onOpenPair={handleOpenPair}
          onExportReport={handleExportReport}
          onExportCsv={handleExportCsv}
        />
      )}

      {!pairing && (
        <p className="batch-note">
          选择两个文件夹后开始对比。文件按相对路径配对，路径配不上的会回退到只比文件名。
        </p>
      )}

      {summary.error > 0 && !batch.running && (
        <p className="batch-note">
          有 {summary.error} 对计算失败，多为图片损坏或超出浏览器可解码尺寸。
        </p>
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
