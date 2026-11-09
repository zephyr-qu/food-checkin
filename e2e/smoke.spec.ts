import { test, expect } from '@open-wxa/wxa-runner-playwright'

// 五个页面都能正常打开并渲染（toHavePath 由官方测试 API 校验页面栈顶）
const PAGES = [
  'pages/timeline/index',
  'pages/city/index',
  'pages/detail/index',
  'pages/compose/index',
  'pages/shop/index',
]

for (const path of PAGES) {
  test(`打开页面并渲染: ${path}`, async ({ miniProgram }) => {
    await miniProgram.open(path)
    await expect(miniProgram).toHavePath(path)
    // 渲染层产出了节点（小程序 view 组件编译后是 wx-view，兼容原生 web component）
    const nodes = miniProgram.current.locator('wx-view, view, text, image').first()
    await expect(nodes).toBeAttached({ timeout: 10_000 })
  })
}

// 首页 → 详情 的跳转链路（bits.jsx 里 FpTabBar 的 navigateTo）
test('navigateTo 到详情页', async ({ miniProgram }) => {
  await miniProgram.open('pages/timeline/index')
  await miniProgram.navigateTo('pages/detail/index?id=test')
  await expect(miniProgram).toHavePath('pages/detail/index')
})

// 首页页面栈与 pageData 可被读取（store 走本地 Storage，初始无数据也应能渲染）
test('首页页面栈与渲染', async ({ miniProgram }) => {
  await miniProgram.open('pages/timeline/index')
  const stack = await miniProgram.pageStack()
  expect(stack.length).toBeGreaterThanOrEqual(1)
  expect(stack[0].path).toBe('pages/timeline/index')
  const nodes = miniProgram.current.locator('wx-view, view, text, image').first()
  await expect(nodes).toBeAttached({ timeout: 10_000 })
})
