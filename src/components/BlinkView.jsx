import { useState, useEffect, useRef, useCallback } from 'react';
import { setupCanvasDPR, onDPRChange } from '../utils/canvasDPR.js';

export default function BlinkView({ img1, img2, width, height, onBlinkChange, blinkSpeed = 500, blinkPaused = false }) {
  const [showFirst, setShowFirst] = useState(true);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    onBlinkChange?.(showFirst ? 'a' : 'b');
  }, [showFirst, onBlinkChange]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;
    const ctx = setupCanvasDPR(canvas, width, height);
    const img = showFirst ? img1 : img2;
    if (img) ctx.drawImage(img, 0, 0, width, height);
  }, [img1, img2, width, height, showFirst]);

  useEffect(() => {
    if (blinkPaused) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setShowFirst((prev) => !prev);
    }, blinkSpeed);
    return () => clearInterval(intervalRef.current);
  }, [blinkSpeed, blinkPaused]);

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
