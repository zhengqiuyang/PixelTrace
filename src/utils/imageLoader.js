/**
 * File → Image 的解码。
 *
 * 单张上传与「批量结果 → 单对深看」两条入口共用这一段：
 * 两边都要「File 变成可绘制的 Image，并附带同一套元信息」。
 * 各写一份的话，元信息字段（fileName / width / height / fileSize / format）
 * 迟早会漂移 —— 而导出报告的头部正是读这几个字段，
 * 漂移的表现是「批量打开的那张图在报告里没有文件名」，很难往回追。
 *
 * 用 dataURL 而不是 blob URL：不用管 revoke 时机，
 * 生命周期跟着 img 走，也不会在多张图并存时泄漏。
 */

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          reject(new Error('corrupted'));
          return;
        }
        resolve({
          img,
          dataUrl: e.target.result,
          meta: {
            fileName: file.name,
            width: img.naturalWidth,
            height: img.naturalHeight,
            fileSize: file.size,
            format: (file.name.split('.').pop() || '').toUpperCase(),
          },
        });
      };
      img.onerror = () => reject(new Error('corrupted'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('corrupted'));
    reader.readAsDataURL(file);
  });
}

/** 从 dataURL 解码（缩放降级路径用，此时手里只有 dataURL 没有 File） */
export function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('corrupted'));
    img.src = dataUrl;
  });
}
