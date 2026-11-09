/* 数据备份：导出 / 导入 JSON。
   纯本地存储是这个产品的全部数据，换手机、清缓存、误删小程序 = 全丢。
   导出把「记录 + 店铺附加信息 + 照片」打成一个 JSON 文件，用户自己存着；
   导入把它还原。

   照片为什么必须内嵌（base64）：
   照片二进制在 wx 文件系统里，路径形如 wxfile://store/xxx.jpg。
   换机后新机器上没有这个文件 —— 只导路径索引的话，备份在别处打开全是裂图。
   所以导出时读文件转 base64 塞进 JSON，导入时再写回文件系统。
   代价是体积（一张约 100~300KB base64），但备份文件本来就要用户手动存，
   一次导出几十张完全可接受。

   格式带 fpBackup 版本号：将来字段变了能识别旧格式，
   比无版本号的裸数组好迁移（core.js 的 fpLoadRecords 就是被裸数组坑过）。

   —— 两条通道，为什么是这两条 ——
   小程序里没有「保存到我的电脑」这种能力，也没有文件选择器。
   唯一能把文件带出去/带进来的地方是聊天：
     导出 = 写文件到 USER_DATA_PATH → shareFileMessage 发到聊天
     导入 = chooseMessageFile 从聊天记录里挑回来
   这不是偷懒的折中，是换机场景下真正走得通的路径：旧手机发到「文件传输助手」，
   新手机从同一个会话里取回。H5 没有这两套 API，降级为剪贴板（见 backup-sheet）。 */
import Taro from '@tarojs/taro'
import {
  FP_STORE_KEY, fpSaveRecords, fpLoadShopExtras, fpSaveShopExtras,
} from './core'
import { fpReadPhotos, fpWritePhotos, fpRemovePhotos, fpShopPhotoKey } from './photo'

export const FP_BACKUP_VERSION = 1
/* 备份文件后缀：chooseMessageFile 靠它过滤，改这里等于改导出文件名 */
export const FP_BACKUP_EXT = 'json'

function fpFsm() {
  try {
    return (Taro.getFileSystemManager && Taro.getFileSystemManager()) || null
  } catch (e) {
    return null
  }
}

function fpUserDir() {
  return (Taro.env && Taro.env.USER_DATA_PATH ? Taro.env.USER_DATA_PATH : 'wxfile://usr')
}

/* 读一个本地文件为 base64（data URL 去掉头）。
   小程序里用 FileSystemManager.readFileSync + encoding: 'base64'。 */
function fpReadFileAsBase64(path) {
  try {
    const fsm = fpFsm()
    if (!fsm || typeof fsm.readFileSync !== 'function') return null
    const r = fsm.readFileSync({ filePath: path, encoding: 'base64' })
    /* 返回值可能是 { data } 或直接字符串，两种都接 */
    const data = r && typeof r === 'object' ? r.data : r
    return typeof data === 'string' && data ? data : null
  } catch (e) {
    return null
  }
}

/* 把 base64 写回文件系统，返回新的持久路径。
   小程序 FileSystemManager.writeFileSync 直接支持 encoding: 'base64' ——
   不需要先解成二进制再写。路径用 `${wx.env.USER_DATA_PATH}/fp-restore-<随机>.jpg`，
   写完再 saveFile 挪进持久区（与选图时的落盘路径一致，删改逻辑才能复用）。 */
function fpWriteBase64File(base64) {
  try {
    const fsm = fpFsm()
    if (!fsm || typeof fsm.writeFileSync !== 'function') return null
    const tmp = fpUserDir()
      + '/fp-restore-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.jpg'
    fsm.writeFileSync(tmp, base64, 'base64')
    const r = Taro.saveFileSync && Taro.saveFileSync(tmp)
    const saved = r && r.savedFilePath ? r.savedFilePath : tmp
    /* 临时文件清掉，别在用户目录里堆垃圾 */
    try {
      if (typeof fsm.unlinkSync === 'function' && saved !== tmp) fsm.unlinkSync({ filePath: tmp })
    } catch (e) { /* 临时文件删不掉不影响主流程 */ }
    return saved
  } catch (e) {
    return null
  }
}

export function fpBuildBackup() {
  const raw = Taro.getStorageSync(FP_STORE_KEY)
  const records = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : []
  const shops = fpLoadShopExtras()

  /* 照片：storage 里存的是「记录 → 路径数组」的索引，
     这里反查成「记录 → base64 数组」。读不到的文件跳过（不阻塞导出）。 */
  const photos = {}
  ;(records || []).forEach((r) => {
    const list = fpReadPhotos('rec-' + r.id)
    if (!list || !list.length) return
    const b64 = []
    list.forEach((p) => {
      if (!p || p.indexOf('http') === 0) return
      const d = fpReadFileAsBase64(p)
      if (d) b64.push(d)
    })
    if (b64.length) photos['rec-' + r.id] = b64
  })

  /* 店面照同样处理 */
  Object.keys(shops).forEach((key) => {
    const list = fpReadPhotos(fpShopPhotoKey(key))
    if (!list || !list.length) return
    const d = fpReadFileAsBase64(list[0])
    if (d) photos[fpShopPhotoKey(key)] = [d]
  })

  return {
    fpBackup: FP_BACKUP_VERSION,
    app: 'food-checkin',
    exportedAt: new Date().toISOString(),
    records,
    shops,
    photos,
  }
}

/* 备份文件名：带日期，用户存多份也分得清哪份是哪天的。 */
export function fpBackupFileName(now) {
  const d = now || new Date()
  const p = (n) => String(n).padStart(2, '0')
  return 'food-checkin-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + '-' + p(d.getHours()) + p(d.getMinutes()) + '.' + FP_BACKUP_EXT
}

/* 生成备份并落成文件，返回文件路径（供 shareFileMessage 用）。
   写文件失败返回 { ok: false, error }，由调用方决定降级方案。 */
export function fpWriteBackupFile(now) {
  const data = fpBuildBackup()
  const json = JSON.stringify(data)
  const fsm = fpFsm()
  if (!fsm || typeof fsm.writeFileSync !== 'function') {
    return { ok: false, error: '当前环境不支持写入文件', json, data }
  }
  try {
    const filePath = fpUserDir() + '/' + fpBackupFileName(now)
    fsm.writeFileSync(filePath, json, 'utf8')
    return { ok: true, filePath, json, data }
  } catch (e) {
    /* 目录不存在等异常：明确回错，不假装成功 */
    return { ok: false, error: '写入备份文件失败', json, data }
  }
}

/* 从聊天记录里选一个备份文件并解析。返回 { ok, data } 或 { ok: false, error }。
   chooseMessageFile 的 tempFilePath 可以直接读，不用先 copy。 */
export function fpPickBackupFile() {
  return new Promise((resolve) => {
    if (!Taro.chooseMessageFile) {
      resolve({ ok: false, error: '当前环境不支持选择文件' })
      return
    }
    Taro.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: [FP_BACKUP_EXT],
    })
      .then((res) => {
        const f = res && res.tempFiles && res.tempFiles[0]
        if (!f || !f.path) {
          resolve({ ok: false, error: '没有选中文件' })
          return
        }
        const parsed = fpParseBackupText(fpReadFileAsText(f.path))
        if (!parsed.ok) { resolve(parsed); return }
        resolve({ ok: true, data: parsed.data, name: f.name || '' })
      })
      .catch((e) => {
        /* 用户点取消也走这里 —— 不当成错误弹窗 */
        const msg = (e && e.errMsg) || ''
        resolve({ ok: false, error: msg.indexOf('cancel') >= 0 ? '' : '读取文件失败' })
      })
  })
}

function fpReadFileAsText(path) {
  try {
    const fsm = fpFsm()
    if (!fsm || typeof fsm.readFileSync !== 'function') return ''
    const r = fsm.readFileSync({ filePath: path, encoding: 'utf8' })
    const data = r && typeof r === 'object' ? r.data : r
    return typeof data === 'string' ? data : ''
  } catch (e) {
    return ''
  }
}

/* 文本 → 备份对象。JSON 坏了要给出「不是备份文件」而不是抛异常。 */
export function fpParseBackupText(text) {
  if (!text || typeof text !== 'string') return { ok: false, error: '文件是空的' }
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: '这不是一份备份文件（内容无法解析）' }
  }
  return fpCheckBackup(data)
}

/* 形状校验单独抽出来：导入前要用，测试也要单独验。
   只认版本号与 records，其余字段缺失按空处理 —— 老备份少个字段不该整份作废。 */
export function fpCheckBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: '文件不是合法的备份' }
  }
  if (data.fpBackup !== FP_BACKUP_VERSION) {
    return { ok: false, error: '备份版本不匹配（需要 v' + FP_BACKUP_VERSION + '）' }
  }
  if (!Array.isArray(data.records)) return { ok: false, error: '备份里没有记录' }
  return { ok: true, data }
}

/* 导入：先校验形状，再逐项落盘。
   返回里的 records 是「已经写进 storage 的那份」——
   调用方必须拿它去刷新内存里的 store（store 有 cache，不刷新界面还是旧的）。 */
export function fpRestoreBackup(data) {
  const checked = fpCheckBackup(data)
  if (!checked.ok) return checked

  const photos = data.photos && typeof data.photos === 'object' ? data.photos : {}

  /* 照片先落盘：记录引用的是新路径，顺序不能反。
     导入采用「新 id 前缀」避免与现有记录的照片键撞车。 */
  const restored = {}
  Object.keys(photos).forEach((key) => {
    const list = photos[key]
    if (!Array.isArray(list) || !list.length) return
    const saved = []
    list.forEach((b64) => {
      if (typeof b64 !== 'string' || !b64) return
      const p = fpWriteBase64File(b64)
      if (p) saved.push(p)
    })
    if (saved.length) restored[key] = saved
  })

  /* 记录与店铺信息 */
  const savedOk = fpSaveRecords(data.records)
  if (data.shops && typeof data.shops === 'object') fpSaveShopExtras(data.shops)

  /* 照片索引逐个写回 storage */
  Object.keys(restored).forEach((key) => {
    fpWritePhotos(key, restored[key])
  })

  /* 记录没落盘就别报成功 —— storage 满了是最可能的失败原因 */
  if (!savedOk) {
    return { ok: false, error: '本地空间不足，备份没能写进去' }
  }

  return {
    ok: true,
    count: data.records.length,
    photos: Object.keys(restored).length,
    records: data.records,
  }
}

/* 清掉导入时写进去但记录已不引用的照片文件（导入失败回滚用）。 */
export function fpDropPhotos(keys) {
  ;(keys || []).forEach((k) => {
    const list = fpReadPhotos(k)
    if (list) fpRemovePhotos(list)
    fpWritePhotos(k, [])
  })
}
