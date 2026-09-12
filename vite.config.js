import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 部署在 https://zhengqiuyang.github.io/PixelTrace/，
  // 路径前缀必须和仓库名一致，否则资源 404。
  // 本地 npm run dev 不受影响（Vite 在 dev 模式下忽略 base）。
  base: '/PixelTrace/',
})
