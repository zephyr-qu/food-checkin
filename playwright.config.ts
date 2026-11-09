import { defineConfig } from '@playwright/test'

// wxa-runner + Taro 接入 PoC 的测试配置
// 前置：npx playwright install chromium  （需 1.64 对应的 chromium build 1248）
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    // Taro 编译产物目录（原生小程序：'.'；这里指向构建产物 dist/）
    wxaProject: './dist',
    // 用 npm 内置基础库 3.7.0：不依赖本机微信开发者工具，CI 也能复现。
    // project.config.json 的 libVersion 仍为 3.8.0，本机预览以该值为准；装了开发者工具并下载 3.8.0 后可改回。
    wxaServerOptions: { baseLibVersion: '3.7.0' }
  },
})
