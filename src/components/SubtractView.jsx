import { useRef, useEffect, useCallback } from 'react';
import { setupCanvasDPR, onDPRChange } from '../utils/canvasDPR.js';

export default function SubtractView({ img1, img2, width, height, mask, threshold = 30 }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img1 || !img2 || !width || !height) return;

    const ctx = setupCanvasDPR(canvas, width, height);
    ctx.drawImage(img1, 0, 0, width, height);

    // 用 useImageDiff 传来的 mask（如果有），否则自己算
    let diffMask = mask;
    if (!diffMask) {
      const c2 = document.createElement('canvas');
      c2.width = width; c2.height = height;
      const ctx2 = c2.getContext('2d');
      ctx2.drawImage(img2, 0, 0, width, height);
      const d2 = ctx2.getImageData(0, 0, width, height);

      const cL = document.createElement('canvas');
      cL.width = width; cL.height = height;
      const ctxL = cL.getContext('2d');
      ctxL.drawImage(img1, 0, 0, width, height);
      const dL = ctxL.getImageData(0, 0, width, height);

      diffMask = new Uint8Array(width * height);
      for (let i = 0; i < diffMask.length; i++) {
        const idx = i * 4;
        const dr = Math.abs(dL.data[idx] - d2.data[idx]);
        const dg = Math.abs(dL.data[idx+1] - d2.data[idx+1]);
        const db = Math.abs(dL.data[idx+2] - d2.data[idx+2]);
        if ((dr + dg + db) / 3 > threshold) diffMask[i] = 1;
      }
    }

    // 灰度底图 + 红色差异
    const cOut = document.createElement('canvas');
    cOut.width = width; cOut.height = height;
    const ctxOut = cOut.getContext('2d');
    ctxOut.drawImage(img1, 0, 0, width, height);
    const outData = ctxOut.getImageData(0, 0, width, height);

    for (let i = 0; i < diffMask.length; i++) {
      const idx = i * 4;
      if (diffMask[i]) {
        outData.data[idx] = 255;
        outData.data[idx+1] = 50;
        outData.data[idx+2] = 50;
      } else {
        const gray = Math.round(outData.data[idx] * 0.3 + outData.data[idx+1] * 0.59 + outData.data[idx+2] * 0.11);
        outData.data[idx] = gray;
        outData.data[idx+1] = gray;
        outData.data[idx+2] = gray;
      }
      outData.data[idx+3] = 255;
    }
    ctxOut.putImageData(outData, 0, 0);
    ctx.drawImage(cOut, 0, 0, width, height);
  }, [img1, img2, width, height, mask, threshold]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => onDPRChange(() => draw()), [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
