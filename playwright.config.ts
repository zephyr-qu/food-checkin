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
    // 本机微信开发者工具已下载 3.8.0，与 project.config.json 的 libVersion 一致
    wxaServerOptions: { baseLibVersion: '3.8.0' }
  },
})
