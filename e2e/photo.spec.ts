import { test, expect } from '@open-wxa/wxa-runner-playwright'

// 照片链路：mock wx.chooseImage 返回临时路径 → fpPickPhotos 走 saveFile 落持久区 →
// 写入 fp.photo.__new 暂存键 → 保存记录时搬到 fp.photo.rec-<id>
// 见 src/data/photo.js、src/pages/compose/index.jsx 的 pickPhoto/submit
//
// 时序注意：pickPhoto 的 saveFile + setStorage 是异步链，读 Storage 一律 expect.poll。

const eatInput = (mp: any) => mp.current.locator('wx-input input').first()
const slot = (mp: any) => mp.current.locator('.fp-slot').first()

/** 手写轮询：某键的数组里是否已出现某路径（expect.poll 不能当 promise 用） */
async function storageIncludes(mp: any, key: string, path: string, timeout = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const raw = await mp.getStorage(key)
    const list = raw == null ? [] : typeof raw === 'string' ? JSON.parse(raw) : raw
    if (Array.isArray(list) && list.includes(path)) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

/** 每次选图之间留出 React 重渲染窗口（连续快速点击会被吞） */
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** mock 选一张图并点照片槽，等暂存键里真的出现它 */
async function pickOne(mp: any, path: string) {
  await mp.mock('chooseImage', {
    tempFilePaths: [path],
    tempFiles: [{ path, size: 1024 }],
  })
  await pause(600) // 上一次写入引发的列表重渲染稳定后再点
  await slot(mp).click()
  const landed = await storageIncludes(mp, 'fp.photo.__new', path, 8_000)
  if (!landed) throw new Error(`photo ${path} 未进入暂存键（点击未生效）`)
  return path
}

test('mock chooseImage 选图后写入暂存键并展示缩略图', async ({ miniProgram }) => {
  await miniProgram.open('pages/compose/index')
  await pickOne(miniProgram, 'wxfile://tmp/test-photo-1.jpg')

  // 渲染层出现照片缩略（PhotoStrip/PhotoSlot 展示 wx-image）
  await expect(miniProgram.current.locator('.fp-drop wx-image').first()).toBeAttached()
})

/** 轮询直到 predicate 为真（expect.poll 不能当 promise 用） */
async function waitUntil(fn: () => Promise<boolean>, timeout = 8_000, what = 'condition') {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`timeout waiting for ${what}`)
}

test('选满 5 张后第 6 张不再写入（remaining 上限）', async ({ miniProgram }) => {
  await miniProgram.open('pages/compose/index')

  // 相册多选的真实形态：一次 chooseImage 返回 5 条路径（count=5）
  const paths = [1, 2, 3, 4, 5].map((i) => `wxfile://tmp/test-photo-${i}.jpg`)
  await miniProgram.mock('chooseImage', {
    tempFilePaths: paths,
    tempFiles: paths.map((p) => ({ path: p, size: 1024 })),
  })
  await slot(miniProgram).click()
  await waitUntil(async () => {
    const raw = await miniProgram.getStorage('fp.photo.__new')
    const list = raw == null ? [] : typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(list) && paths.every((p) => list.includes(p))
  }, 8_000, '5 photos staged')

  // 已满 5 张：fpPickPhotos 内 room=0 直接 resolve 空数组，不弹选图也不写入
  await miniProgram.mock('chooseImage', {
    tempFilePaths: ['wxfile://tmp/should-not-be-added.jpg'],
    tempFiles: [{ path: 'wxfile://tmp/should-not-be-added.jpg', size: 1024 }],
  })
  await slot(miniProgram).click()
  await new Promise((r) => setTimeout(r, 1_000))

  const raw2 = await miniProgram.getStorage('fp.photo.__new')
  const list2 = raw2 == null ? [] : typeof raw2 === 'string' ? JSON.parse(raw2) : raw2
  expect(list2.filter((p: string) => p.startsWith('wxfile://tmp/test-photo-')).length).toBe(5)
  expect(list2).not.toContain('wxfile://tmp/should-not-be-added.jpg')
})

test('保存记录后照片从 __new 搬家到 rec-<id>', async ({ miniProgram }) => {
  await miniProgram.open('pages/compose/index')
  const picked = await pickOne(miniProgram, 'wxfile://tmp/move-test.jpg')

  // 填必填项并保存
  await eatInput(miniProgram).fill('照片搬家测试餐')
  await expect(eatInput(miniProgram)).toHaveValue('照片搬家测试餐')
  await miniProgram.current.locator('wx-view.fp-star').nth(3).click()
  await expect(miniProgram.current.locator('.fp-rate-num')).toHaveText('4 / 5', { timeout: 5_000 })
    .catch(async () => {
      await miniProgram.current.locator('wx-view.fp-star').nth(3).click()
      await expect(miniProgram.current.locator('.fp-rate-num')).toHaveText('4 / 5')
    })
  await miniProgram.current.locator('.fp-btn-primary').click()
  await expect(miniProgram).toHavePath('pages/timeline/index')

  // 记录落盘后照片键已搬到 rec-<id>，__new 清空
  await expect.poll(async () => {
    const rawRec = await miniProgram.getStorage('fp.records.v2')
    const records = typeof rawRec === 'string' ? JSON.parse(rawRec) : rawRec
    const saved = Array.isArray(records) ? records.find((r: any) => r.eat === '照片搬家测试餐') : null
    if (!saved) return 'no-record'
    const rawMoved = await miniProgram.getStorage(`fp.photo.rec-${saved.id}`)
    const moved = rawMoved == null ? [] : typeof rawMoved === 'string' ? JSON.parse(rawMoved) : rawMoved
    return Array.isArray(moved) && moved.includes(picked) ? 'moved' : 'not-moved'
  }, { timeout: 10_000 }).toBe('moved')

  // __new 已清空（写入了空数组或删除）
  const rawNew = await miniProgram.getStorage('fp.photo.__new')
  const list = rawNew == null ? [] : typeof rawNew === 'string' ? JSON.parse(rawNew) : rawNew
  expect(Array.isArray(list) ? list.length : 0).toBe(0)
})
