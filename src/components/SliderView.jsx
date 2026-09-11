import { useRef, useEffect, useCallback } from 'react';
import { setupCanvasDPR, onDPRChange } from '../utils/canvasDPR.js';

export default function SliderView({ img1, img2, width, height, sliderPos }) {
  const canvas1Ref = useRef(null);
  const canvas2Ref = useRef(null);

  const sliderX = (sliderPos / 100) * width;

  const draw = useCallback(() => {
    if (canvas1Ref.current && img1) {
      const ctx = setupCanvasDPR(canvas1Ref.current, width, height);
      ctx.drawImage(img1, 0, 0, width, height);
    }
    if (canvas2Ref.current && img2) {
      const ctx = setupCanvasDPR(canvas2Ref.current, width, height);
      ctx.drawImage(img2, 0, 0, width, height);
    }
  }, [img1, img2, width, height]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => onDPRChange(() => draw()), [draw]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvas2Ref}
        width={width}
        height={height}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
      <div style={{ position: 'absolute', top: 0, left: 0, width: sliderX, height: '100%', overflow: 'hidden' }}>
        <canvas
          ref={canvas1Ref}
          width={width}
          height={height}
          style={{ width: `${width}px`, height: `${height}px`, display: 'block' }}
        />
      </div>
    </div>
  );
}

