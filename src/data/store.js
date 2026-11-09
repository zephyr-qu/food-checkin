/* 跨页面共享状态：原型把 records 放在 app 层，五屏共用一份。
   小程序每个页面是独立实例，这里用一个订阅式 store 承接 ——
   写完广播，所有页面同步（等价于原型的 fp-records-changed 事件）。 */
import React from 'react'
import Taro from '@tarojs/taro'
import { FP_RECORDS, FP_VARIANT, FP_DEMO_PHOTO_SEEDS } from './demo-records'
import { fpLoadRecords, fpSaveRecords } from './core'
import { fpReadPhotos, fpWritePhotos } from './photo'

const listeners = []
let cache = null
/* 存不进去只提示一次：storage 满了一般是持续状态，每改一笔弹一次
   会把「改不动」变成「弹不完」，反而盖住真正的操作反馈。 */
let saveFailedToast = false

/* 顶部留白按真机胶囊按钮高度算，不再写死 62px（见 styles/fp.css 的说明）。
   算法：胶囊 bottom + 8px 间距 = .fp-head 该有的 padding-top。
   微信官方推荐做法，把「状态栏高度 + 胶囊高度」两个变量一次覆盖 ——
   安卓这两项差异很大（状态栏 24~40px、胶囊 32~40px），写死值会偏或压标题。
   量不到（H5 / 旧基础库）保持 62px 原值。 */
export const FP_STATUS_TOP_DEFAULT = 62
let fpStatusTop = FP_STATUS_TOP_DEFAULT
let fpStatusMeasured = false

/* 重新测量：清掉「只测一次」的缓存。
   真实用途是极端场景——小程序胶囊位置在特定系统字体放大后会变，
   以及测试里要按不同机型分别断言。 */
export function fpResetStatusTop() {
  fpStatusTop = FP_STATUS_TOP_DEFAULT
  fpStatusMeasured = false
}

export function fpMeasureStatusTop() {
  if (fpStatusMeasured) return fpStatusTop
  fpStatusMeasured = true
  try {
    const r = Taro.getMenuButtonBoundingClientRect && Taro.getMenuButtonBoundingClientRect()
    /* 边界按「胶囊 bottom 的合理区间」定，不是按算出来的 top 定：
       真机上 bottom 至少 40+（状态栏 24 + 胶囊 32 起），刘海屏也就 120 左右。
       0 / 8 这种读数只会把标题顶到状态栏上，宁可保持默认；
       之前按 top > 0 判断，bottom=0 会算出 top=8 混过去 —— 就是这个测试抓出来的。 */
    if (r && typeof r.bottom === 'number' && r.bottom >= 40 && r.bottom <= 200) {
      fpStatusTop = Math.round(r.bottom + 8)
    }
  } catch (e) {
    /* 量不到就用默认值，不阻塞渲染 */
  }
  return fpStatusTop
}

/* 页面根节点的 inline style：把 --status-top 送到 .fp-app 上。
   小程序改不了 page 元素的 style，.fp-app 是每个页面的根节点，走 JSX 最稳。
   刻意不叫 useXxx：它不是 Hook（没有状态、没有副作用、调用顺序无所谓），
   叫 use 会被 react-hooks 规则误判 —— detail/shop 有空记录早退分支，
   在分支之后调用「Hook」会直接报 rules-of-hooks。 */
export function fpAppRootStyle() {
  return { '--status-top': fpMeasureStatusTop() + 'px' }
}

/* 示例态样照：storage 里没有记录（用的是内置示例）时，给两笔示例挂上静态样照，
   让照片槽 / 叠层 / 预览在第一眼就是活的。fpReadPhotos 返回非 null
   （用户删过样照）就不再补写 —— 用户的手优先于种子。 */
function seedDemoPhotos() {
  FP_DEMO_PHOTO_SEEDS.forEach((s) => {
    if (fpReadPhotos('rec-' + s.id) === null) fpWritePhotos('rec-' + s.id, s.photos)
  })
}

export function getRecords() {
  if (cache === null) {
    cache = fpLoadRecords()
    if (!cache) {
      cache = FP_RECORDS
      seedDemoPhotos()
    }
  }
  return cache
}

export function setRecords(next) {
  const records = typeof next === 'function' ? next(getRecords()) : next
  cache = records
  /* 内置示例数据不落盘：落了盘就变成「存储里的旧快照」，示例升级后反而被自己挡住。
     用户一编辑出来的是新数组（!== FP_RECORDS），照常保存。 */
  if (records !== FP_RECORDS && !fpSaveRecords(records)) {
    /* 落盘失败（最常见是 storage 超过 10MB）必须说出来：
       静默失败时界面照常更新，用户以为存住了，下次开程序数据没了。 */
    if (!saveFailedToast) {
      saveFailedToast = true
      Taro.showToast({ title: '本地空间不足，这一笔没存住', icon: 'none', duration: 2500 })
    }
  }
  listeners.forEach((fn) => fn(records))
}

/* 供「导入备份」用：存储被外部整块覆盖后，把内存缓存丢掉重新读，
   再广播一次让所有页面一起刷新。不走 setRecords —— 那条路径会
   把 records 再写回 storage（等于把刚导入的东西又写一遍）。 */
export function reloadRecords() {
  cache = fpLoadRecords()
  if (!cache) {
    cache = FP_RECORDS
    seedDemoPhotos()
  }
  listeners.forEach((fn) => fn(cache))
  return cache
}

export function subscribeRecords(fn) {
  listeners.push(fn)
  return () => {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  }
}

/* 页面订阅助手：onShow 读一次、之后变化同步，onHide 卸掉。 */
export function useRecords() {
  const [records, setLocal] = React.useState(getRecords)
  React.useEffect(() => subscribeRecords(setLocal), [])
  return [records, setRecords]
}

export { FP_VARIANT }
