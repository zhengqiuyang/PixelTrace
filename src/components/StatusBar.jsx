import { useMemo } from 'react';
import { useAppContext } from '../hooks/useAppContext.js';
import { clientToImagePoint, samplePixel, toHex } from '../utils/canvasCoords.js';

/**
 * 底部状态栏 (PRODUCT.md §4.1)
 * 结构: 缩放比例 │ 鼠标坐标 │ 当前像素 RGB │ 变更区域数
 *
 * 坐标与色值取「原始图」上的像素（差异是相对原图的偏移，原图才是基准）。
 * 鼠标移出画布时回落为 `--`，不保留上一次的残值，避免误导。
 *
 * 取样结果完全由 (鼠标位置, 图片) 决定，因此在 render 期用 useMemo 推导，
 * 不再用 effect + state 二次渲染；坐标映射与取样画布与放大镜共用同一套实现。
 */
export default function StatusBar({ image, mouseX, mouseY, hovering, regions }) {
  const { state } = useAppContext();
  const { zoom } = state;

  const imgW = image ? (image.naturalWidth || image.width) : 0;
  const imgH = image ? (image.naturalHeight || image.height) : 0;

  const probe = useMemo(() => {
    if (!hovering || mouseX == null || mouseY == null) return null;
    const point = clientToImagePoint(mouseX, mouseY, imgW, imgH);
    if (!point) return null;
    return { ...point, pixel: samplePixel(image, point.x, point.y) };
  }, [hovering, mouseX, mouseY, image, imgW, imgH]);

  const regionCount = regions ? regions.length : 0;
  const hex = probe?.pixel ? toHex(probe.pixel) : null;

  return (
    <div className="status-bar">
      <span className="status-seg status-zoom" title="当前缩放比例">
        {Math.round(zoom * 100)}%
      </span>

      <span className="status-seg status-coord" title="鼠标所在图像坐标">
        {probe ? `(${probe.x}, ${probe.y})` : '(--, --)'}
      </span>

      <span className="status-seg status-color" title="原始图当前像素 RGB">
        <span
          className={`status-swatch ${hex ? '' : 'is-empty'}`}
          style={hex ? { background: hex } : undefined}
          aria-hidden="true"
        />
        <span className="status-hex">{hex || '--'}</span>
      </span>

      <span className="status-seg status-regions" title="差异变更区域数量">
        变更: <span className="status-regions-num">{regionCount}</span> 个区域
      </span>
    </div>
  );
}
