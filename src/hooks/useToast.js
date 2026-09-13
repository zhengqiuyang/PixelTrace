import { toastAdapter } from '../utils/toast.js';

/**
 * useToast() —— 拿到 toast 适配器。
 *
 * 直接返回模块级单例，不用 useContext。sonner 是模块级 API、
 * 没有 Provider 要求，所以这里也没有「必须在 Provider 内调用」的前提。
 *
 * 保留 hook 形式（而不是让调用方直接 import 对象）有两个原因：
 *   1. 项目里 7 处调用都是 useToast() 的写法，不用改。
 *   2. 以后要接测试替身 / mock 时，改这一行就够，调用方不动。
 */
export function useToast() {
  return toastAdapter;
}
