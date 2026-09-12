import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并 Tailwind class，冲突时后者胜出。
 * 用法和 clsx 一样，但会自动处理 utility 冲突（如 p-2 和 p-4 同时出现）。
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}