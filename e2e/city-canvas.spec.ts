import { test, expect } from '@open-wxa/wxa-runner-playwright'

// 城市地图页：canvas 2d 中国地图 + 省份 pin 下钻。
// 重点验证 wxa-runner 对 canvas 节点的支持（文档标为"网页实现有差异"的项）。

test('city 页 canvas 节点正常创建（type=2d）', async ({ miniProgram }) => {
  await miniProgram.open('pages/city/index')
  await expect(miniProgram).toHavePath('pages/city/index')

  // canvas 组件被渲染出来（Taro Canvas → wx-canvas）
  await expect(miniProgram.current.locator('wx-canvas#fp-map-canvas, canvas').first()).toBeAttached()
})

test('空记录时显示引导文案，有演示数据时出 pin', async ({ miniProgram }) => {
  await miniProgram.open('pages/city/index')

  // 演示数据（FP_RECORDS）里有城市记录，应有省份 pin
  const pins = miniProgram.current.locator('.fp-pin')
  const count = await pins.count()
  expect(count).toBeGreaterThan(0)

  // 最高级（full）图钉只显示省名 + 纯数字，不带「笔」字（与 pill 级文案保持一致）
  const fullCount = miniProgram.current.locator('.fp-pin-full .fp-pin-count').first()
  await expect(fullCount).toBeAttached()
  await expect(fullCount).toHaveText(/^\d+$/)
})

test('点击省份 pin 下钻到市级视图', async ({ miniProgram }) => {
  await miniProgram.open('pages/city/index')

  // 点第一个 pin（全国视图下是省份 pin，点击 drillTo）
  const firstPin = miniProgram.current.locator('.fp-pin').first()
  await firstPin.click()

  // 下钻后出现「← 全国」返回按钮
  await expect(miniProgram.current.locator('.fp-mapback')).toBeAttached({ timeout: 5_000 })
})

test('city 页无运行时错误（canvas/rAF 在官方基础库下不炸）', async ({ miniProgram }) => {
  await miniProgram.open('pages/city/index')
  await miniProgram.current.locator('.fp-pin').first().click({ timeout: 5_000 }).catch(() => {})
  // fixture 结束时默认 wxaCheckErrors 检查 errors() 为空；
  // 这里显式断言一次，让 canvas 相关错误直接暴露在报告里
  const errs = await miniProgram.errors()
  expect(errs).toEqual([])
})

test('备份/恢复入口在城市页底部，首页头部已移除', async ({ miniProgram }) => {
  // 首页（原位置）：头部不再有备份入口
  await miniProgram.open('pages/timeline/index')
  await expect(miniProgram.current.locator('.fp-backup-btn')).toHaveCount(0)

  // 城市页：滚动区底部有入口，点开是备份抽屉，能取消关闭
  await miniProgram.open('pages/city/index')
  const btn = miniProgram.current.locator('.fp-backup-btn')
  await expect(btn).toBeAttached()
  await btn.click()
  await expect(miniProgram.current.locator('.fp-sheet-title')).toHaveText('备份 / 恢复')
  await miniProgram.current.locator('.fp-sheet-cancel').click()
  await expect(miniProgram.current.locator('.fp-sheet')).toHaveCount(0)
})
