import { useState, useEffect, useRef, useCallback } from 'react';

let canvasIdCounter = 0;

function extractImageData(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

async function computeOnMain(dataA, dataB, settings, currentId, computeIdRef, cacheRef, setters) {
  const { computeDiff, findDiffRegions } = await import('../utils/imageDiff.js');

  if (currentId !== computeIdRef.current) return;

  const { diffImageData: diffImg, diffCount, mask } = computeDiff(dataA, dataB, {
    threshold: settings.threshold,
  });

  const foundRegions = findDiffRegions(mask, diffImg.width, diffImg.height, {
    minArea: settings.minArea,
    mergeDistance: settings.mergeDistance,
    maxRegions: settings.maxRegions ?? 500,
  });

  const totalPixels = diffImg.width * diffImg.height;
  const result = {
    diffImageData: diffImg,
    diffCount,
    mask,
    regions: foundRegions,
    stats: {
      totalPixels,
      diffCount,
      diffPercentage: totalPixels > 0 ? (diffCount / totalPixels) * 100 : 0,
      regionCount: foundRegions.length,
    },
  };

  cacheRef.current = result;
  setters.setDiffImageData(result.diffImageData);
  setters.setMask(result.mask);
  setters.setRegions(result.regions);
  setters.setStats(result.stats);
  setters.setComputing(false);
  setters.setProgress(100);
}

function getImageId(img) {
  if (!img) return 'null';
  if (img.src) return img.src.slice(-80);
  // Canvas elements: use dimensions + incrementing id to avoid collision
  if (!img._diffId) img._diffId = `canvas:${img.width}x${img.height}:${++canvasIdCounter}`;
  return img._diffId;
}

export function useImageDiff(imgA, imgB, settings) {
  const [diffImageData, setDiffImageData] = useState(null);
  const [mask, setMask] = useState(null);
  const [regions, setRegions] = useState([]);
  const [stats, setStats] = useState(null);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState(0);

  const workerRef = useRef(null);
  const computeIdRef = useRef(0);
  const debounceTimerRef = useRef(null);
  const lastParamsRef = useRef('');
  const cacheRef = useRef(null);

  const settersRef = useRef({
    setDiffImageData,
    setMask,
    setRegions,
    setStats,
    setComputing,
    setProgress,
  });

  const cleanup = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!imgA || !imgB) {
      setDiffImageData(null);
      setMask(null);
      setRegions([]);
      setStats(null);
      setComputing(false);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      const paramsKey = `${getImageId(imgA)}|${getImageId(imgB)}|${settings.threshold}|${settings.minArea}|${settings.mergeDistance}`;

      if (paramsKey === lastParamsRef.current && cacheRef.current) {
        const cached = cacheRef.current;
        setDiffImageData(cached.diffImageData);
        setMask(cached.mask);
        setRegions(cached.regions);
        setStats(cached.stats);
        setComputing(false);
        setProgress(100);
        return;
      }

      lastParamsRef.current = paramsKey;
      setComputing(true);
      setProgress(0);

      const currentId = ++computeIdRef.current;

      const wA = imgA.naturalWidth || imgA.width;
      const hA = imgA.naturalHeight || imgA.height;
      const wB = imgB.naturalWidth || imgB.width;
      const hB = imgB.naturalHeight || imgB.height;
      const w = Math.min(wA, wB);
      const h = Math.min(hA, hB);

      // 延迟到下一帧执行，让 loading UI 先渲染
      requestAnimationFrame(() => {
        if (settings.useWorker && typeof Worker !== 'undefined') {
          // 复用常驻 Worker，不每次新建
          if (!workerRef.current) {
            try {
              workerRef.current = new Worker(
                new URL('../workers/diffWorker.js', import.meta.url),
                { type: 'module' }
              );
            } catch {
              const freshA = extractImageData(imgA, w, h);
              const freshB = extractImageData(imgB, w, h);
              computeOnMain(freshA, freshB, settings, currentId, computeIdRef, cacheRef, settersRef.current);
              return;
            }
          }

          const dataA = extractImageData(imgA, w, h);
          const dataB = extractImageData(imgB, w, h);

          workerRef.current.onmessage = (e) => {
            if (e.data.id !== currentId) return;

            if (e.data.type === 'progress') {
              setProgress(e.data.percent);
            } else if (e.data.type === 'result') {
              const result = e.data.result;
              cacheRef.current = result;
              setDiffImageData(result.diffImageData);
              setMask(result.mask);
              setRegions(result.regions);
              setStats(result.stats);
              setComputing(false);
              setProgress(100);
            } else if (e.data.type === 'error') {
              console.error('Worker error, falling back:', e.data.error);
              workerRef.current.terminate();
              workerRef.current = null;
              const freshA = extractImageData(imgA, w, h);
              const freshB = extractImageData(imgB, w, h);
              computeOnMain(freshA, freshB, settings, currentId, computeIdRef, cacheRef, settersRef.current);
            }
          };

          workerRef.current.postMessage(
            {
              type: 'compute',
              id: currentId,
              imageDataA: dataA,
              imageDataB: dataB,
              settings,
            },
            [dataA.data.buffer, dataB.data.buffer]
          );
        } else {
          const dataA = extractImageData(imgA, w, h);
          const dataB = extractImageData(imgB, w, h);
          computeOnMain(dataA, dataB, settings, currentId, computeIdRef, cacheRef, settersRef.current);
        }
      });
    }, 150);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [imgA, imgB, settings, cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return {
    diffImageData,
    mask,
    regions,
    stats,
    computing,
    progress,
  };
}
