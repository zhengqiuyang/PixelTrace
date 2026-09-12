import { useEffect, useState } from 'react';

export default function SliderLine({ sliderPos, width, height }) {
  const [pos, setPos] = useState({ x: 0, y: 0, h: 0 });

  useEffect(() => {
    let rafId;
    let lastX = 0, lastY = 0, lastH = 0;

    const update = () => {
      const content = document.querySelector('.canvas-stage-content');
      if (!content) return;

      const style = window.getComputedStyle(content);
      const transform = style.transform;
      let scale = 1, tx = 0, ty = 0;
      if (transform && transform !== 'none') {
        const m = transform.match(/matrix\(([^)]+)\)/);
        if (m) {
          const v = m[1].split(',').map(Number);
          scale = v[0];
          tx = v[4];
          ty = v[5];
        }
      }

      const sliderX = (sliderPos / 100) * width;
      const x = tx + sliderX * scale;
      const y = ty;
      const h = height * scale;

      if (x !== lastX || y !== lastY || h !== lastH) {
        lastX = x; lastY = y; lastH = h;
        setPos({ x, y, h });
      }
    };

    const loop = () => {
      update();
      rafId = requestAnimationFrame(loop);
    };
    loop();

    return () => cancelAnimationFrame(rafId);
  }, [sliderPos, width, height]);

  if (!pos.x && !pos.y) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: pos.y,
        left: pos.x - 1,
        width: 2,
        height: pos.h,
        background: 'var(--accent)',
        boxShadow: '0 0 8px rgba(var(--accent-rgb), 0.5)',
        zIndex: 15,
        pointerEvents: 'none',
      }}
    />
  );
}
