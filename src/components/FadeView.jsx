import { useRef, useEffect, useCallback } from 'react';
import { setupCanvasDPR, onDPRChange } from '../utils/canvasDPR.js';

export default function FadeView({ img1, img2, width, height, opacity }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img1 || !width || !height) return;
    const ctx = setupCanvasDPR(canvas, width, height);

    ctx.globalAlpha = 1;
    ctx.drawImage(img1, 0, 0, width, height);
    ctx.globalAlpha = opacity;
    if (img2) ctx.drawImage(img2, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }, [img1, img2, width, height, opacity]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => onDPRChange(() => draw()), [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
