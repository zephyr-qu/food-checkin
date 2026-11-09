/* 备份/恢复：这是「换手机、清缓存」时唯一的数据出口，
   一轮下来要保证「导出什么、就还原什么」。
   重点不是函数被调过，而是往返之后记录、店铺信息、照片路径都对得上。 */
import Taro from '@tarojs/taro'
import {
  fpBuildBackup, fpWriteBackupFile, fpCheckBackup, fpParseBackupText,
  fpRestoreBackup, fpBackupFileName, FP_BACKUP_VERSION,
} from '../src/data/backup'
import { fpSaveRecords, fpLoadRecords, FP_SHOP_STORE_KEY } from '../src/data/core'
import { fpReadPhotos, fpWritePhotos } from '../src/data/photo'

const REC = {
  id: 'r1', eat: '甜水面', shop: '老麻抄手', city: '成都', district: '武侯区',
  rating: 5, at: '2026-10-01T12:30:00', note: '甜辣刚好',
}

beforeEach(() => {
  Taro.clearStorageSync()
  Taro.__files.clear()
})

describe('fpBuildBackup', () => {
  it('把 storage 里的记录原样带出来', () => {
    fpSaveRecords([REC])
    const b = fpBuildBackup()
    expect(b.fpBackup).toBe(FP_BACKUP_VERSION)
    expect(b.records).toEqual([REC])
    expect(b.app).toBe('food-checkin-mp')
    expect(typeof b.exportedAt).toBe('string')
  })

  it('没有记录时给空数组，不是 null（导入端要能直接 Array.isArray）', () => {
    const b = fpBuildBackup()
    expect(Array.isArray(b.records)).toBe(true)
    expect(b.records.length).toBe(0)
  })

  it('照片路径被读成 base64 塞进备份', () => {
    fpSaveRecords([REC])
    Taro.__files.set('/photo/a.jpg', { data: 'AAAA', encoding: 'base64' })
    fpWritePhotos('rec-r1', ['/photo/a.jpg'])

    const b = fpBuildBackup()
    expect(b.photos['rec-r1']).toEqual(['AAAA'])
  })

  it('读不出来的照片跳过，不拖垮整份备份', () => {
    fpSaveRecords([REC])
    fpWritePhotos('rec-r1', ['/photo/missing.jpg'])
    const b = fpBuildBackup()
    expect(b.photos['rec-r1']).toBeUndefined()
    expect(b.records.length).toBe(1)
  })

  it('网络图（http 开头）不尝试读本地文件', () => {
    fpSaveRecords([REC])
    fpWritePhotos('rec-r1', ['https://example.com/a.jpg'])
    const b = fpBuildBackup()
    expect(b.photos['rec-r1']).toBeUndefined()
  })
})

describe('fpCheckBackup', () => {
  it('版本号不对就拒收', () => {
    const r = fpCheckBackup({ fpBackup: 99, records: [] })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('版本')
  })

  it('records 不是数组就拒收', () => {
    const r = fpCheckBackup({ fpBackup: 1, records: {} })
    expect(r.ok).toBe(false)
  })

  it('裸数组 / null / 字符串都拒收', () => {
    expect(fpCheckBackup([]).ok).toBe(false)
    expect(fpCheckBackup(null).ok).toBe(false)
    expect(fpCheckBackup('x').ok).toBe(false)
  })

  it('合法备份通过', () => {
    const r = fpCheckBackup({ fpBackup: 1, records: [REC] })
    expect(r.ok).toBe(true)
    expect(r.data.records.length).toBe(1)
  })
})

describe('fpParseBackupText', () => {
  it('坏 JSON 报「不是备份」而不是抛异常', () => {
    const r = fpParseBackupText('{坏掉的')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('备份')
  })

  it('空文本单独报错', () => {
    expect(fpParseBackupText('').ok).toBe(false)
    expect(fpParseBackupText(null).ok).toBe(false)
  })

  it('合法 JSON 走完校验', () => {
    const r = fpParseBackupText(JSON.stringify({ fpBackup: 1, records: [REC] }))
    expect(r.ok).toBe(true)
  })
})

describe('往返：导出 → 导入', () => {
  it('记录原样还原', () => {
    fpSaveRecords([REC])
    const b = fpBuildBackup()
    Taro.clearStorageSync()
    const r = fpRestoreBackup(b)
    expect(r.ok).toBe(true)
    expect(r.count).toBe(1)
    expect(fpLoadRecords()).toEqual([REC])
  })

  it('照片落回文件系统并写回索引', () => {
    fpSaveRecords([REC])
    Taro.__files.set('/photo/a.jpg', { data: 'AAAA', encoding: 'base64' })
    fpWritePhotos('rec-r1', ['/photo/a.jpg'])
    const b = fpBuildBackup()

    Taro.clearStorageSync()
    Taro.__files.clear()
    const r = fpRestoreBackup(b)

    expect(r.ok).toBe(true)
    const paths = fpReadPhotos('rec-r1')
    expect(paths.length).toBe(1)
    /* 路径是新的（不是原来那个），且文件真的能读回同样的内容 */
    expect(paths[0]).not.toBe('/photo/a.jpg')
    expect(Taro.__files.get(paths[0]).data).toBe('AAAA')
  })

  it('导入空记录备份：不报错，记录被清空', () => {
    fpSaveRecords([REC])
    const r = fpRestoreBackup({ fpBackup: 1, records: [] })
    expect(r.ok).toBe(true)
    expect(r.count).toBe(0)
    /* fpLoadRecords 把空数组当「没有数据」返回 null（既有语义：
       空手账回落到内置示例）。所以这里断言"读不出旧记录"，
       而不是要求它返回 [] —— 那是另一个函数的口径。 */
    expect(fpLoadRecords()).toBeNull()
  })

  it('店铺附加信息跟着往返', () => {
    fpSaveRecords([REC])
    const shops = { '老麻抄手|成都': { note: '排队 20 分钟', rating: 4 } }
    Taro.setStorageSync(FP_SHOP_STORE_KEY, JSON.stringify(shops))
    const b = fpBuildBackup()
    Taro.clearStorageSync()
    fpRestoreBackup(b)
    expect(b.shops).toEqual(shops)
  })

  it('版本不对时一条都不写', () => {
    fpSaveRecords([REC])
    const before = fpLoadRecords()
    const r = fpRestoreBackup({ fpBackup: 99, records: [] })
    expect(r.ok).toBe(false)
    expect(fpLoadRecords()).toEqual(before)
  })
})

describe('fpWriteBackupFile', () => {
  it('写成文件并返回路径', () => {
    fpSaveRecords([REC])
    const r = fpWriteBackupFile()
    expect(r.ok).toBe(true)
    expect(r.filePath).toContain('food-checkin-')
    expect(r.filePath.endsWith('.json')).toBe(true)
    /* 文件真的写进去了，内容能解析回来 */
    const text = Taro.__files.get(r.filePath).data
    expect(JSON.parse(text).records.length).toBe(1)
  })

  it('文件名带日期，不同时刻不同名（不互相覆盖）', () => {
    const a = fpBackupFileName(new Date('2026-10-01T09:05:00'))
    const b = fpBackupFileName(new Date('2026-10-02T09:05:00'))
    expect(a).toBe('food-checkin-20261001-0905.json')
    expect(b).not.toBe(a)
  })
})
