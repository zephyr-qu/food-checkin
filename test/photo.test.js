/* 照片链路：暂存 → 搬家 → 清理。这是上一批修的两个 bug 的回归防线 ——
   新建记录照片丢失、删除记录留孤儿文件，都是这儿漏一步造成的。 */
import Taro from '@tarojs/taro'
import {
  fpReadPhotos, fpWritePhotos, fpNotifyPhotos, fpOnPhotos, fpPickPhotos, fpRemovePhotos,
  FP_MAX_PHOTOS, FP_NEW_PHOTO_KEY, fpShopPhotoKey, fpDropPhotoAt, fpPhotoRoom,
} from '../src/data/photo'

/* 个别用例会把 getFileSystemManager / removeSavedFile 换成假实现，
   用完必须还原 —— 否则后面的用例拿到被改过的 mock，失败点跑到别处，很难查。 */
const realFsm = Taro.getFileSystemManager
const realRemove = Taro.removeSavedFile

beforeEach(() => {
  Taro.clearStorageSync()
  Taro.getFileSystemManager = realFsm
  Taro.removeSavedFile = realRemove
})

describe('fpReadPhotos / fpWritePhotos', () => {
  it('没设置过的键返回 null（与「设置成空数组」区分开）', () => {
    expect(fpReadPhotos('x')).toBeNull()
  })

  it('写空数组后返回空数组（显式的「没有照片」）', () => {
    fpWritePhotos('x', [])
    expect(fpReadPhotos('x')).toEqual([])
  })

  it('上限 FP_MAX_PHOTOS 之外的被裁掉', () => {
    const many = []
    for (let i = 0; i < 8; i += 1) many.push('/p/' + i + '.jpg')
    fpWritePhotos('x', many)
    expect(fpReadPhotos('x').length).toBe(FP_MAX_PHOTOS)
  })

  it('null / undefined 也写成空数组（不炸）', () => {
    fpWritePhotos('x', null)
    expect(fpReadPhotos('x')).toEqual([])
  })

  it('过滤掉假值路径', () => {
    fpWritePhotos('x', ['/a.jpg', null, '', '/b.jpg'])
    expect(fpReadPhotos('x')).toEqual(['/a.jpg', '/b.jpg'])
  })
})

describe('FP_NEW_PHOTO_KEY 搬家流程（新建记录）', () => {
  it('提交时把暂存搬到 rec-<新id> 并清空暂存', () => {
    const staged = ['/a.jpg', '/b.jpg']
    fpWritePhotos(FP_NEW_PHOTO_KEY, staged)
    /* 模拟 compose 页 submit 里的搬家动作 */
    const id = 'r123'
    const read = fpReadPhotos(FP_NEW_PHOTO_KEY)
    if (read) fpWritePhotos('rec-' + id, read)
    fpWritePhotos(FP_NEW_PHOTO_KEY, [])
    /* 时间轴 / 详情读的是 rec-<id>，必须能读到 */
    expect(fpReadPhotos('rec-r123')).toEqual(staged)
    expect(fpReadPhotos(FP_NEW_PHOTO_KEY)).toEqual([])
  })

  it('没选照片时也清空暂存（不残留到下一次新建）', () => {
    fpWritePhotos(FP_NEW_PHOTO_KEY, ['/old.jpg'])
    const read = fpReadPhotos(FP_NEW_PHOTO_KEY)
    if (read) fpWritePhotos('rec-r999', read)
    fpWritePhotos(FP_NEW_PHOTO_KEY, [])
    expect(fpReadPhotos('rec-r999')).toEqual(['/old.jpg'])
    expect(fpReadPhotos(FP_NEW_PHOTO_KEY)).toEqual([])
  })

  it('从未选过照片：read 返回 null，不写出空记录键', () => {
    const read = fpReadPhotos(FP_NEW_PHOTO_KEY)
    expect(read).toBeNull()
  })
})

describe('fpOnPhotos / fpNotifyPhotos', () => {
  it('写入后通知，订阅者收到', () => {
    const seen = []
    const off = fpOnPhotos(() => seen.push(1))
    fpNotifyPhotos()
    expect(seen).toHaveLength(1)
    off()
    fpNotifyPhotos()
    expect(seen).toHaveLength(1)
  })

  it('eventCenter 不存在时不炸（H5 兜底）', () => {
    expect(() => fpNotifyPhotos()).not.toThrow()
  })
})

describe('fpPickPhotos', () => {
  it('用户取消时返回空数组（不写坏数据）', async () => {
    Taro.chooseImage = () => Promise.resolve({ tempFilePaths: [] })
    await expect(fpPickPhotos({ stack: true })).resolves.toEqual([])
  })

  it('stack=false 时最多收一张', async () => {
    Taro.chooseImage = () => Promise.resolve({ tempFilePaths: ['/a.jpg', '/b.jpg'] })
    Taro.saveFile = (o) => Promise.resolve({ savedFilePath: 'saved:' + o.tempFilePath })
    const saved = await fpPickPhotos({ stack: false })
    expect(saved).toEqual(['saved:/a.jpg'])
  })

  it('stack 模式最多收 FP_MAX_PHOTOS 张', async () => {
    Taro.chooseImage = () => Promise.resolve({
      tempFilePaths: ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg', '/f.jpg', '/g.jpg'],
    })
    Taro.saveFile = (o) => Promise.resolve({ savedFilePath: 'saved:' + o.tempFilePath })
    const saved = await fpPickPhotos({ stack: true })
    expect(saved).toHaveLength(FP_MAX_PHOTOS)
  })

  it('saveFile 失败时退回临时路径（图还在，不丢）', async () => {
    Taro.chooseImage = () => Promise.resolve({ tempFilePaths: ['/a.jpg'] })
    Taro.saveFile = () => Promise.reject(new Error('fail'))
    await expect(fpPickPhotos({})).resolves.toEqual(['/a.jpg'])
  })
})

describe('fpRemovePhotos', () => {
  it('http 开头的路径跳过（网络图不归文件系统管）', () => {
    const calls = []
    Taro.removeSavedFile = (o) => { calls.push(o.filePath); return Promise.resolve() }
    fpRemovePhotos(['https://x/a.jpg', 'http://y/b.jpg'])
    expect(calls).toEqual([])
  })

  it('null / undefined 不炸', () => {
    expect(() => fpRemovePhotos(null)).not.toThrow()
    expect(() => fpRemovePhotos([undefined, null])).not.toThrow()
  })

  it('普通本地路径走 removeSavedFile', () => {
    const calls = []
    Taro.removeSavedFile = (o) => { calls.push(o.filePath); return Promise.resolve() }
    fpRemovePhotos(['/wxfile/a.jpg'])
    expect(calls).toEqual(['/wxfile/a.jpg'])
  })

  it('removeSavedFile 返回 void 时（老基础库）不炸', () => {
    Taro.removeSavedFile = () => undefined
    expect(() => fpRemovePhotos(['/wxfile/a.jpg'])).not.toThrow()
  })

  it('removeSavedFile 抛异常时静默（不影响主流程）', () => {
    Taro.removeSavedFile = () => { throw new Error('boom') }
    expect(() => fpRemovePhotos(['/wxfile/a.jpg'])).not.toThrow()
  })

  it('有 getFileSystemManager 时兜底 unlink', () => {
    const unlinked = []
    Taro.removeSavedFile = () => Promise.reject(new Error('gone'))
    Taro.getFileSystemManager = () => ({ unlink: (o) => { unlinked.push(o.filePath) } })
    fpRemovePhotos(['/wxfile/a.jpg', '/wxfile/b.jpg'])
    expect(unlinked).toEqual(['/wxfile/a.jpg', '/wxfile/b.jpg'])
  })
})

/* 撤销窗口本身的状态机测试在 core.test.js 的 fpUndoWindow 一节 ——
   这里原本有两个「假装测撤销」的用例：它们只是读一遍照片再断言没人删，
   断言恒成立，永远测不出「忘记调用删除」这类 bug。已删除。 */

describe('fpDropPhotoAt / fpPhotoRoom（照片管理）', () => {
  it('摘掉指定位置，其余顺序不变', () => {
    fpWritePhotos('k', ['/a.jpg', '/b.jpg', '/c.jpg'])
    expect(fpDropPhotoAt('k', 1)).toEqual(['/a.jpg', '/c.jpg'])
    expect(fpReadPhotos('k')).toEqual(['/a.jpg', '/c.jpg'])
  })

  it('摘最后一张', () => {
    fpWritePhotos('k', ['/a.jpg', '/b.jpg'])
    expect(fpDropPhotoAt('k', 1)).toEqual(['/a.jpg'])
  })

  it('越界索引原样返回，不误删', () => {
    fpWritePhotos('k', ['/a.jpg'])
    expect(fpDropPhotoAt('k', 5)).toEqual(['/a.jpg'])
    expect(fpDropPhotoAt('k', -1)).toEqual(['/a.jpg'])
  })

  it('没设置过的键不炸', () => {
    expect(fpDropPhotoAt('none', 0)).toEqual([])
  })

  it('摘光后是空数组（显式空，不是 null）', () => {
    fpWritePhotos('k', ['/a.jpg'])
    expect(fpDropPhotoAt('k', 0)).toEqual([])
    expect(fpReadPhotos('k')).toEqual([])
  })

  it('fpPhotoRoom 报剩余空位', () => {
    fpWritePhotos('k', [])
    expect(fpPhotoRoom('k')).toBe(FP_MAX_PHOTOS)
    fpWritePhotos('k', ['/a.jpg', '/b.jpg'])
    expect(fpPhotoRoom('k')).toBe(FP_MAX_PHOTOS - 2)
  })

  it('满了时剩余为 0，不会变负数', () => {
    const full = []
    for (let i = 0; i < FP_MAX_PHOTOS; i += 1) full.push('/p' + i + '.jpg')
    fpWritePhotos('k', full)
    expect(fpPhotoRoom('k')).toBe(0)
  })
})

describe('fpShopPhotoKey', () => {
  it('店面照键带 shop- 前缀', () => {
    expect(fpShopPhotoKey('大壶春@上海')).toBe('shop-大壶春@上海')
  })

  it('与记录照片的 rec- 前缀不冲突', () => {
    expect(fpShopPhotoKey('大壶春@上海')).not.toBe('rec-大壶春@上海')
  })
})
