/**
 * PixelTrace JSDoc 类型定义
 * 来源: PRODUCT.md §8.1, §5.1.5, §9.3
 */

/**
 * 差异区域 (§8.1)
 * @typedef {Object} DiffRegion
 * @property {number} id - 区域编号 (从 1 开始)
 * @property {number} x - 左上角 x 坐标
 * @property {number} y - 左上角 y 坐标
 * @property {number} width - 区域宽度
 * @property {number} height - 区域高度
 * @property {number} pixels - 差异像素数量
 * @property {{ x: number, y: number }} center - 中心点
 * @property {number} percentage - 占总差异的百分比
 * @property {string} thumbnail - Base64 缩略图 (64×64)
 */

/**
 * 图片元数据 (§5.1.5, §5.2)
 * @typedef {Object} ImageMeta
 * @property {string} fileName - 文件名
 * @property {number} width - 宽度 (px)
 * @property {number} height - 高度 (px)
 * @property {number} fileSize - 文件大小 (bytes)
 * @property {string} format - 格式 (PNG/JPG/WebP 等)
 * @property {string} [colorSpace] - 色彩空间 (sRGB/Display P3)
 */

/**
 * 应用设置 (§9.3)
 * @typedef {Object} AppSettings
 * @property {number} threshold - 差异阈值 (0-100)
 * @property {number} minArea - 最小区域面积
 * @property {number} mergeDistance - 合并距离
 * @property {boolean} showDiffBoxes - 显示差异区域边框
 * @property {boolean} showRegionNumbers - 显示区域编号
 * @property {boolean} showGrid - 显示像素网格
 * @property {boolean} showCrosshair - 显示十字参考线
 * @property {string} highlightColor - 差异高亮颜色
 * @property {number} zoomStepPercent - 滚轮缩放步进百分比
 * @property {boolean} smoothZoom - 平滑缩放动画
 * @property {boolean} showZoomPercent - 缩放时显示百分比
 * @property {boolean} useWorker - 使用 WebWorker
 * @property {number} renderScale - 渲染精度 (1 | 0.5 | 0.25)
 */

/**
 * 缩放与平移状态
 * @typedef {Object} ZoomPanState
 * @property {number} zoom - 当前缩放比 (0.10 ~ 16.00)
 * @property {{ x: number, y: number }} pan - 平移偏移量 (px)
 * @property {boolean} fitToWindow - 是否处于"适应窗口"模式
 */

/**
 * 差异计算结果
 * @typedef {Object} DiffResult
 * @property {ImageData} diffImageData - 差异 ImageData
 * @property {Uint8Array} mask - 差异掩码 (0/1)
 * @property {number} diffCount - 差异像素数
 * @property {number} totalCount - 总像素数
 * @property {number} diffPercentage - 差异百分比
 * @property {DiffRegion[]} regions - 差异区域列表
 */

/**
 * 错误信息
 * @typedef {Object} AppError
 * @property {string} code - 错误码
 * @property {string} message - 用户可见消息
 * @property {boolean} canContinue - 是否可继续
 * @property {boolean} canScale - 是否可缩放
 */

/**
 * Worker 消息: 请求计算
 * @typedef {Object} DiffWorkerRequest
 * @property {'compute'} type
 * @property {ImageData} imageDataA
 * @property {ImageData} imageDataB
 * @property {AppSettings} settings
 */

/**
 * Worker 消息: 进度回报
 * @typedef {Object} DiffWorkerProgress
 * @property {'progress'} type
 * @property {number} percent - 0~100
 */

/**
 * Worker 消息: 计算完成
 * @typedef {Object} DiffWorkerResult
 * @property {'result'} type
 * @property {DiffResult} result
 */

/**
 * @typedef {DiffWorkerRequest | DiffWorkerProgress | DiffWorkerResult} DiffWorkerMessage
 */
