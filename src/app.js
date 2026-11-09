/* 小程序入口。
   页面结构沿用原型的五屏：时间轴 / 城市 / 详情 / 录入（含编辑）/ 店铺。
   App 是 React class 组件：h5 的 createReactApp 用 isClassComponent 判定后走 React 渲染，
   纯类不带 React.Component 父类会被无 new 调用（weapp 侧同样兼容）。
   追加：H5 键盘可达引导 —— 交互块都是 div + onClick（小程序端靠触摸，
   没有键盘流），H5 端要让 Tab 走得到、Enter/空格按得动，只能在入口统一补：
   给已知交互类挂 tabindex=0，回车/空格代点。类清单与 styles/fp.css 的
   :focus-visible 焦点环同源（改一处要同步另一处）。 */
import React from 'react'
import './styles/fp.css'
import './app.css'

/* 交互类清单：行/卡/槽/店名/月份签/底部导航/搜索清除/分段钮/筛选 chip/
   星钮/「改」/主按钮/位置面板行与返回关闭/图钉/排行行/地图返回/无坐标行/
   备份入口/店照相机。选类不选 [role=button]：全站只有四个块写了 role，
   漏网的多数是这些常点的类。 */
const FP_KBD_CLASSES = [
  'fp-rec', 'fp-tile', 'fp-slot', 'fp-sub-shoplink', 'fp-month-toggle',
  'fp-tab', 'fp-tab-add', 'fp-pstrip-cell', 'fp-pstrip-add', 'fp-undobar-btn',
  'fp-empty-reset', 'fp-search-clear', 'fp-seg-btn', 'fp-chip', 'fp-star',
  'fp-auto-edit', 'fp-btn', 'fp-arearow', 'fp-area-back', 'fp-area-close',
  'fp-pin', 'fp-rank-row', 'fp-rank-more', 'fp-mapback', 'fp-nocity',
  'fp-backup-btn', 'fp-shop-photoicon',
]
const FP_KBD_SEL = FP_KBD_CLASSES.map((c) => '.' + c).join(',')

function fpTagKeyboardTargets(root) {
  FP_KBD_CLASSES.forEach((cls) => {
    /* HTMLCollection 没有 forEach（只有 NodeList 有），显式转数组。 */
    Array.from(root.getElementsByClassName(cls)).forEach((el) => {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
    })
  })
}

class App extends React.Component {
  componentDidMount() {
    /* 只在 H5 挂：小程序没有键盘 Tab 流，DOM API 也受基础库约束。 */
    if (process.env.TARO_ENV !== 'h5' || typeof document === 'undefined') return
    fpTagKeyboardTargets(document)
    this.kbdObserver = new MutationObserver((muts) => {
      muts.forEach((m) => {
        Array.from(m.addedNodes).forEach((node) => {
          if (node.nodeType !== 1) return
          if (node.classList && FP_KBD_CLASSES.some((c) => node.classList.contains(c))) {
            if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '0')
          }
          fpTagKeyboardTargets(node)
        })
      })
    })
    this.kbdObserver.observe(document.body, { childList: true, subtree: true })
    this.kbdKeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const el = e.target && e.target.closest ? e.target.closest(FP_KBD_SEL) : null
      if (!el) return
      /* 输入框本体不在清单里；再兜一道，空格照常打字。 */
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return
      e.preventDefault()
      el.click()
    }
    document.addEventListener('keydown', this.kbdKeydown)
  }
  componentWillUnmount() {
    if (this.kbdObserver) this.kbdObserver.disconnect()
    if (this.kbdKeydown) document.removeEventListener('keydown', this.kbdKeydown)
  }
  onLaunch() {}
  onShow() {}
  onHide() {}
  onPageNotFound() {}
  /* h5 的 createReactApp 以「prototype 是否有 render」判定 React 组件；必须渲染 children。 */
  render() {
    return this.props.children
  }
}

export default App
