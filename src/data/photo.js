/* 照片链路：选图 → 保存到小程序文件系统 → 记录里只存路径。
   原型把 dataURL 塞 localStorage，小程序 storage 上限 10MB，必须换文件系统：
   Taro.chooseImage 直接给出压缩后的临时路径，Taro.saveFile 把它挪进持久区。 */
import Taro from '@tarojs/taro'

export const FP_PHOTO_EVT = 'fp-photo-change'
/* 新建态的暂存键：照片先放这儿，保存时搬到 rec-<新id>（见 compose 页 submit）。
   独立常量而不是散落的 '__new' 字符串 —— 搬家和清理是两处，错一处就丢照片。 */
export const FP_NEW_PHOTO_KEY = '__new'
export const FP_MAX_PHOTOS = 5

/* 堆叠倾角：按下标（离顶距离）取值，顶上一张最正，越往下越歪。 */
export const FP_STACK_ROT = ['-0.8deg', '-6.5deg', '5deg', '-3.5deg', '7.5deg']

const keyOf = (key) => 'fp.photo.' + key

/* 返回 null = 这个键从没设置过；返回数组（可能为空）= 设置过。
   两者必须分开：区分「从未操作」和「明确清空」，后者要压过演示数据键。 */
export function fpReadPhotos(key) {
  try {
    const raw = Taro.getStorageSync(keyOf(key))
    if (!raw) return null
    if (typeof raw === 'string' && raw.charAt(0) === '[') {
      try {
        const arr = JSON.parse(raw)
        return Array.isArray(arr) ? arr : []
      } catch (e) {
        return []
      }
    }
    return []
  } catch (e) {
    return null
  }
}

export function fpWritePhotos(key, list) {
  const clean = (list || []).filter(Boolean).slice(0, FP_MAX_PHOTOS)
  try {
    /* 空数组也写进去（而不是删键）：「明确清空」与「从没设置过」必须分开 ——
       示例态样照种子只认后者，用户删过样照就永不补写。 */
    Taro.setStorageSync(keyOf(key), JSON.stringify(clean))
    return true
  } catch (e) {
    return false
  }
}

export function fpNotifyPhotos() {
  Taro.eventCenter && Taro.eventCenter.trigger(FP_PHOTO_EVT)
  if (fpPhotoListeners.length) fpPhotoListeners.forEach((fn) => fn())
}

/* 跨页面同步：小程序没有 window 事件总线，这里用一份监听名单 + Taro.eventCenter 兜底。 */
const fpPhotoListeners = []
export function fpOnPhotos(fn) {
  fpPhotoListeners.push(fn)
  return () => {
    const i = fpPhotoListeners.indexOf(fn)
    if (i >= 0) fpPhotoListeners.splice(i, 1)
  }
}

/* 选图并落盘。count：一次最多收几张；stack=false 时后选覆盖。
   remaining：还能再放几张（已有几张之外的空位）。
   传了 remaining 才能挡住「已经 3 张还让选 5 张、结果静默丢掉 3 张」——
   用户选了却发现没存上，是最典型的「白操作」。
   chooseImage 自带压缩（compressed: true），省掉原型里那段 canvas 压缩逻辑。 */
export function fpPickPhotos({ stack = false, count, remaining } = {}) {
  const cap = stack ? FP_MAX_PHOTOS : 1
  /* 有 remaining 就按空位算；没传当空位无限（老调用方式保持兼容） */
  const room = typeof remaining === 'number' ? Math.max(0, Math.min(remaining, cap)) : cap
  const max = Math.min(count || cap, room)
  /* 空位为 0 时不弹选图 —— 弹了也没地方放，直接告诉用户满了 */
  if (max <= 0) return Promise.resolve([])
  return new Promise((resolve, reject) => {
    Taro.chooseImage({
      count: max,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    })
      .then(async (res) => {
        const paths = res.tempFilePaths || []
        if (!paths.length) return resolve([])
        const saved = []
        /* 逐张落进持久目录：临时文件在小程序销毁后就没了，必须 saveFile。 */
        for (let i = 0; i < paths.length && i < max; i += 1) {
          const r = await Taro.saveFile({ tempFilePath: paths[i] }).catch(() => null)
          saved.push((r && r.savedFilePath) || paths[i])
        }
        resolve(saved)
      })
      .catch(reject)
  })
}

/* 清掉旧文件，避免持久区越积越多（删除记录、换照片时调用）。
   H5 没有文件系统（Taro.removeSavedFile 在 h5 是 temporarilyNotSupport），
   所以兜底也用 getFileSystemManager().unlink：真机删得掉、H5 静默跳过，
   两端都不该因为「清理失败」影响主流程。 */
export function fpRemovePhotos(paths) {
  ;(paths || []).forEach((p) => {
    if (!p || p.indexOf('http') === 0) return
    const done = () => {}
    const fail = () => {}
    try {
      const r = Taro.removeSavedFile({ filePath: p, success: done, fail })
      /* removeSavedFile 在老基础库上返回 void（非 Promise），catch 不到失败 */
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch (e) {
      /* ignore */
    }
    try {
      const fsm = Taro.getFileSystemManager && Taro.getFileSystemManager()
      if (fsm && typeof fsm.unlink === 'function') fsm.unlink({ filePath: p, success: done, fail })
    } catch (e) {
      /* ignore */
    }
  })
}

/* 单张删除：从某个键的照片列表里摘掉第 index 张，返回新列表。
   只动索引、不删文件 —— 文件由调用方在确认后 fpRemovePhotos 清掉，
   因为「摘掉索引」是可撤销的，「删文件」不是。 */
export function fpDropPhotoAt(key, index) {
  const list = fpReadPhotos(key) || []
  const i = index | 0
  if (i < 0 || i >= list.length) return list
  const next = list.slice(0, i).concat(list.slice(i + 1))
  fpWritePhotos(key, next)
  return next
}

/* 还能再放几张：给 picker 传 remaining 用，也用于「已满」提示的判断。 */
export function fpPhotoRoom(key) {
  const list = fpReadPhotos(key) || []
  return Math.max(0, FP_MAX_PHOTOS - list.length)
}

/* 店面照：与记录照片同一套读写，键是「shop-<店铺键>」。 */
export function fpShopPhotoKey(shopKey) {
  return 'shop-' + shopKey
}
