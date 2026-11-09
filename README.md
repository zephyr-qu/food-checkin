# 好吃的 · 美食打卡小程序

用 Taro 4 + React 写的美食打卡微信小程序，同时支持 H5 预览。视觉定稿为「抹茶贴纸」。

数据全部存在本机（`wx.storage` + 本地文件系统），不发任何网络请求。

## 快速开始

```bash
npm install
npm run dev:weapp   # → dist/，用微信开发者工具打开
npm run dev:h5      # → dist-h5/，预览 http://127.0.0.1:10086
npm run check       # lint + 测试 + 双端构建
```

微信开发者工具需在「详情 → 本地设置」开启「不校验合法域名」。

## 目录

```
src/        页面、组件、数据逻辑与样式
config/     Taro 构建配置
test/       Jest 单元测试
e2e/        Playwright 端到端测试
static/     静态资源
design/     改版原型
landing/    落地页
```

## 测试

```bash
npm test
```
