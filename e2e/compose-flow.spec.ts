import { test, expect } from '@open-wxa/wxa-runner-playwright'

// 录入流程端到端：填表 → 保存 → 跳回时间轴 → Storage 落盘 → 时间轴可见
// 数据模型见 src/data/core.js：FP_STORE_KEY = 'fp.records.v2'
// 记录结构：{ id, eat, shop, city, district, rating, at, note }
//
// 时序注意：fill/click 之后 React 状态更新、Storage 落盘都是异步的，
// 断言一律用 expect / expect.poll 轮询，不写固定 sleep。

const eatInput = (mp: any) => mp.current.locator('wx-input input').first()
const starN = (mp: any, n: number) => mp.current.locator('wx-view.fp-star').nth(n - 1)
const saveBtn = (mp: any) => mp.current.locator('.fp-btn-primary')

/** 保存记录并等它真的落进 Storage，返回该条记录 */
async function saveOne(mp: any, eat: string, stars: number) {
  await mp.open('pages/compose/index')
  await eatInput(mp).fill(eat)
  // 受控组件同步完成（fill 后立即点星会被 React 重渲染窗口吞掉点击）
  await expect(eatInput(mp)).toHaveValue(eat)
  await starN(mp, stars).click()
  // 评分文本变化 = React 状态已更新；点击偶发丢失时重试一次
  await expect(mp.current.locator('.fp-rate-num')).toHaveText(`${stars} / 5`, { timeout: 5_000 })
    .catch(async () => {
      await starN(mp, stars).click()
      await expect(mp.current.locator('.fp-rate-num')).toHaveText(`${stars} / 5`)
    })
  // 按钮解除禁用 = canSave 为 true
  await expect(saveBtn(mp)).not.toHaveClass(/fp-disabled/)
  await saveBtn(mp).click()

  // 跳回时间轴（submit 里 430ms 延迟后 reLaunch）
  await expect(mp).toHavePath('pages/timeline/index')

  // Storage 里出现这条记录（落盘是异步的，轮询）
  let saved: any = null
  await expect.poll(async () => {
    const raw = await mp.getStorage('fp.records.v2')
    const records = typeof raw === 'string' ? JSON.parse(raw) : raw
    saved = Array.isArray(records) ? records.find((r: any) => r.eat === eat) : null
    return saved ? 'found' : 'missing'
  }, { timeout: 10_000 }).toBe('found')
  return saved
}

/** 读某键的照片数组（fpWritePhotos 写的是 JSON 字符串） */
async function readPhotos(mp: any, key: string) {
  const raw = await mp.getStorage(key)
  if (raw == null) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

test('空表单点保存被必填校验拦住（按钮禁用态）', async ({ miniProgram }) => {
  await miniProgram.open('pages/compose/index')
  await expect(miniProgram.current.locator('.fp-btn-primary.fp-disabled')).toBeAttached()
})

test('填表保存后落回时间轴，Storage 字段与输入一致', async ({ miniProgram }) => {
  const saved = await saveOne(miniProgram, '葱油拌面', 4)
  expect(saved.rating).toBe(4)
  // 店名是第二个 wx-input，单独填
  expect(saved.city).toBe('成都') // compose 页默认城市
  expect(typeof saved.id).toBe('string')
})

test('店名输入后随记录一起落盘', async ({ miniProgram }) => {
  await miniProgram.open('pages/compose/index')
  await eatInput(miniProgram).fill('担担面')
  await expect(eatInput(miniProgram)).toHaveValue('担担面')
  await starN(miniProgram, 5).click()
  await expect(miniProgram.current.locator('.fp-rate-num')).toHaveText('5 / 5', { timeout: 5_000 })
    .catch(async () => {
      await starN(miniProgram, 5).click()
      await expect(miniProgram.current.locator('.fp-rate-num')).toHaveText('5 / 5')
    })
  await miniProgram.current.locator('wx-input input').nth(1).fill('测试小面馆')
  await expect(saveBtn(miniProgram)).not.toHaveClass(/fp-disabled/)
  await saveBtn(miniProgram).click()
  await expect(miniProgram).toHavePath('pages/timeline/index')

  let saved: any = null
  await expect.poll(async () => {
    const raw = await miniProgram.getStorage('fp.records.v2')
    const records = typeof raw === 'string' ? JSON.parse(raw) : raw
    saved = Array.isArray(records) ? records.find((r: any) => r.eat === '担担面') : null
    return saved ? 'found' : 'missing'
  }, { timeout: 10_000 }).toBe('found')
  expect(saved.shop).toBe('测试小面馆')
})

test('保存后时间轴列表出现新记录', async ({ miniProgram }) => {
  await saveOne(miniProgram, '牛肉面', 5)
  // 当前页已是时间轴，列表里出现刚录入的菜名
  await expect(
    miniProgram.current.locator('wx-text', { hasText: '牛肉面' }).first(),
  ).toBeAttached()
})

test('编辑回填：保存一条后带 id 进 compose 表单带出原值', async ({ miniProgram }) => {
  const saved = await saveOne(miniProgram, '种子蛋糕', 3)

  await miniProgram.open(`pages/compose/index?id=${saved.id}`)
  // 表单回填：菜名、星级
  await expect(miniProgram.current.locator('wx-input input').first()).toHaveValue('种子蛋糕')
  await expect(miniProgram.current.locator('.fp-rate-num')).toHaveText('3 / 5')
  await expect(miniProgram.current.locator('wx-view.fp-star').nth(2).locator('.fp-rshape.fp-on')).toBeAttached()
})

test('改完保存后原记录被更新（不新增）', async ({ miniProgram }) => {
  const target = await saveOne(miniProgram, '更新前的一笔', 2)

  // 还原真实入口：时间轴是 tab 根页，编辑页从它 navigateTo 进来（栈深 2）。
  // 直接 open 编辑页的话栈深为 1，submit 的 navigateBack 会失败 —— 那是测试入口不真实，不是产品 bug。
  await miniProgram.open('pages/timeline/index')
  await miniProgram.navigateTo(`pages/compose/index?id=${target.id}`)
  await expect(miniProgram.current.locator('wx-input input').first()).toHaveValue('更新前的一笔')
  await miniProgram.current.locator('wx-input input').first().fill('更新后的一笔')
  await expect(eatInput(miniProgram)).toHaveValue('更新后的一笔')
  await expect(saveBtn(miniProgram)).not.toHaveClass(/fp-disabled/)
  await saveBtn(miniProgram).click()
  // 编辑态保存后是 navigateBack 回时间轴
  await expect(miniProgram).toHavePath('pages/timeline/index')

  // 同一个 id，eat 已更新，旧菜名消失
  await expect.poll(async () => {
    const raw = await miniProgram.getStorage('fp.records.v2')
    const records = typeof raw === 'string' ? JSON.parse(raw) : raw
    const updated = records.find((r: any) => r.id === target.id)
    if (!updated) return 'missing'
    return updated.eat === '更新后的一笔' ? 'updated' : 'stale'
  }, { timeout: 10_000 }).toBe('updated')

  const raw = await miniProgram.getStorage('fp.records.v2')
  const records = typeof raw === 'string' ? JSON.parse(raw) : raw
  expect(records.filter((r: any) => r.eat === '更新前的一笔').length).toBe(0)
})

export { readPhotos }
