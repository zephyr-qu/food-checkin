/* 屏 1.5：城市。
   分级下钻：全国视图按省聚合 → 点有记录的省下钻到省内城市（真实经纬度落图钉）→
   点城市进城市详情页（图钉 / 城市排行 / 没测坐标行三个入口殊途同归）→「← 全国」返回。
   地图下方紧跟「城市排行」：笔数降序 + 条宽按榜首归一，整行可点。
   底图是分省路径（离线数据）。小程序没有 <svg>，改用 Canvas 2D 绘制：
   路径只有 M/L/Z（直线段），自己解析后逐段 lineTo；省份点击命中也用 JS 射线法算
   （fill-rule evenodd，多子路径按奇偶计数），不依赖 canvas 的 isPointInPath。
   标签层仍是 DOM 元素叠在画布上，沿用原型的分档降级 + 松弛排布算法。 */
import React from 'react'
import { View, Text, Canvas } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRecords, reloadRecords, FP_VARIANT, fpAppRootStyle } from '../../data/store'
import {
  fpGroupByCity, fpGroupByProvince, fpCityXY, provShort,
} from '../../data/core'
import { fpWriteBackupFile, fpPickBackupFile, fpRestoreBackup } from '../../data/backup'
import { FP_CHINA_PROVS, FP_CHINA_MAP } from '../../data/china-map'
import { routeTo, FpTabBar, Empty } from '../../components/bits'
import { Icon } from '../../components/icons'
import { FP_COLORS } from '../../styles/tokens'

/* —— 路径解析：数据只有 M/L/Z 与坐标对，多子路径按大写 M 切环。 —— */
function parsePath(d) {
  const rings = []
  let ring = []
  let pendingX = null
  const tokens = d.match(/[MLZ]|-?\d+(?:\.\d+)?/g) || []

  const closeRing = () => {
    if (ring.length >= 3) rings.push(ring)
    ring = []
    pendingX = null
  }
  for (let t = 0; t < tokens.length; t += 1) {
    const tok = tokens[t]
    if (tok === 'Z' || tok === 'z') {
      closeRing()
      continue
    }
    if (tok === 'M' || tok === 'L') {
      /* M 在已有环时开新环；坐标对紧随其后 */
      if (tok === 'M' && ring.length >= 3) closeRing()
      pendingX = null
      continue
    }
    const v = parseFloat(tok)
    if (pendingX === null) { pendingX = v; continue }
    ring.push([pendingX, v])
    pendingX = null
  }
  if (ring.length >= 3) rings.push(ring)
  return rings.filter((r) => r.length >= 3)
}

/* 扫描线射线法：点是否在环内。 */
function inRing(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

/* evenodd：所有环里命中奇数次 = 内部。 */
function inProv(prov, x, y) {
  let hits = 0
  prov._rings.forEach((r) => { if (inRing(r, x, y)) hits += 1 })
  return hits % 2 === 1
}

/* 惰性解析并缓存：34 省路径只解析一次。 */
const provRings = FP_CHINA_PROVS.map((p) => ({ ...p, _rings: parsePath(p.d) }))
/* 省名 → 省份对象 的索引：渲染里按省名取省份（画底图、算质心标签、下钻定位）
   原本每次都是 provRings.filter(...)[0] —— 34 项线性扫，每渲染扫好几遍。
   建一次表，之后全是 O(1)。 */
const provRingsByN = {}
provRings.forEach((p) => { provRingsByN[p.n] = p })

const VB = FP_CHINA_MAP || { w: 1000, h: 717 }

/* 标签排布参数与原型 screens.jsx 一致（含松驰算法，两处必须一起改）。 */
const TILTS = [-2.6, 1.8, -1.4, 2.4, -2, 1.5, -1.8, 2.2]
const OX = 13
const OY = 15
const DIRS = [[1, -1], [-1, 1], [1, 1], [-1, -1]]
/* 估算标签盒时的画布尺寸：原型是 366×264 实测值，但小程序的画布实测会略小
   （375 视口减去 .fp-scroll 两侧内边距 ≈ 343）。按 366 换算百分比会让盒偏小 6%，
   贴边标签算得下、实际却被 .fp-map 的 overflow:hidden 裁掉一半 —— 用实测值。
   这里是初始默认，量到真实尺寸后由 state 覆盖。 */
const MAP_PX_FALLBACK = { w: 366, h: 264 }
const PIN_FULL_MAX = 4
const PIN_PILL_MAX = 8
/* 城市排行默认露出几座：5 座 + 一行「还有 N 座」≈ 240px，
   加上地图 264px 与标题区，首屏仍能看见「← 全国」按钮。 */
const RANK_TOP = 5

function assignTiers(items) {
  const crowded = items.length > PIN_FULL_MAX
  items.forEach((p, i) => {
    p.tier = !crowded ? 'full' : i < PIN_FULL_MAX ? 'full' : i < PIN_PILL_MAX ? 'pill' : 'dot'
  })
}

function sizePin(p, nameLen, mapPx) {
  const px =
    p.tier === 'pill'
      ? { w: nameLen * 13 + 48, h: 42 }
      : p.tier === 'dot'
        ? { w: 29, h: 29 }
        : { w: Math.max(nameLen * 17 + 42, 76), h: 70 }
  p.bw = (px.w / mapPx.w) * 100
  p.bh = (px.h / mapPx.h) * 100
}

/* 松弛排布：两两相压就沿短轴推开，直到没有重叠（两个逃逸机制：
   短轴被限位卡死换长轴、每轮洗牌配对顺序破除振荡，与原型逐字一致）。 */
function layoutLabels(items, push) {
  const clampX = (p, v) => Math.min(99 - p.bw / 2, Math.max(p.bw / 2 + 1, v))
  const clampY = (p, v) => Math.min(99 - p.bh / 2, Math.max(p.bh / 2 + 1, v))
  items.sort((a, b) => a.ax - b.ax || a.ay - b.ay)
  items.forEach((p, i) => {
    p.lx = clampX(p, p.ax)
    p.ly = clampY(p, p.ay)
    if (push) {
      const dir = DIRS[i % DIRS.length]
      const ox = p.ax + dir[0] * OX
      const oy = p.ay + dir[1] * OY
      p.lx = clampX(p, ox)
      p.ly = clampY(p, oy)
      if (p.lx !== ox) p.lx = clampX(p, p.ax - dir[0] * OX)
      if (p.ly !== oy) p.ly = clampY(p, p.ay - dir[1] * OY)
    }
    p.tilt = TILTS[i % TILTS.length]
  })
  let rs = 20261013
  const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff }
  const nudge = (a, b, axis) => {
    const hw = (a.bw + b.bw) / 2
    const hh = (a.bh + b.bh) / 2
    const dx = Math.abs(a.lx - b.lx)
    const dy = Math.abs(a.ly - b.ly)
    const ov = axis === 'x' ? hw - dx : hh - dy
    if (ov <= 0) return false
    const q = ov / 2 + 0.6
    if (axis === 'x') {
      const s = a.lx <= b.lx ? -1 : 1
      const ax0 = a.lx
      const bx0 = b.lx
      a.lx = clampX(a, a.lx + s * q)
      b.lx = clampX(b, b.lx - s * q)
      return a.lx !== ax0 || b.lx !== bx0
    }
    const s = a.ly <= b.ly ? -1 : 1
    const ay0 = a.ly
    const by0 = b.ly
    a.ly = clampY(a, a.ly + s * q)
    b.ly = clampY(b, b.ly - s * q)
    return a.ly !== ay0 || b.ly !== by0
  }
  for (let it = 0; it < 250; it += 1) {
    const order = items.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1))
      const t = order[i]
      order[i] = order[j]
      order[j] = t
    }
    let open = 0
    let movedAny = false
    for (let oi = 0; oi < order.length; oi += 1) {
      for (let oj = oi + 1; oj < order.length; oj += 1) {
        const a = items[order[oi]]
        const b = items[order[oj]]
        const dx = Math.abs(a.lx - b.lx)
        const dy = Math.abs(a.ly - b.ly)
        if (dx >= (a.bw + b.bw) / 2 || dy >= (a.bh + b.bh) / 2) continue
        open += 1
        const hw = (a.bw + b.bw) / 2 - dx
        const hh = (a.bh + b.bh) / 2 - dy
        movedAny = nudge(a, b, hw <= hh ? 'x' : 'y') || movedAny
        const dx2 = Math.abs(a.lx - b.lx)
        const dy2 = Math.abs(a.ly - b.ly)
        if (dx2 < (a.bw + b.bw) / 2 && dy2 < (a.bh + b.bh) / 2) {
          movedAny = nudge(a, b, hw <= hh ? 'y' : 'x') || movedAny
        }
      }
    }
    if (!open) break
    if (!movedAny) {
      for (let oi = 0; oi < order.length; oi += 1) {
        for (let oj = oi + 1; oj < order.length; oj += 1) {
          const a = items[order[oi]]
          const b = items[order[oj]]
          if (
            Math.abs(a.lx - b.lx) >= (a.bw + b.bw) / 2 ||
            Math.abs(a.ly - b.ly) >= (a.bh + b.bh) / 2
          ) continue
          a.lx = clampX(a, a.lx + (rnd() - 0.5) * 4)
          a.ly = clampY(a, a.ly + (rnd() - 0.5) * 4)
          b.lx = clampX(b, b.lx + (rnd() - 0.5) * 4)
          b.ly = clampY(b, b.ly + (rnd() - 0.5) * 4)
        }
      }
    }
  }
  return items
}

/* —— 视口框（viewBox 目标框）：宽高比恒等于画布，飞行只做等比缩放 + 平移 ——
   原型 SVG 靠 preserveAspectRatio 保形（比例不配就四周留白），转成 Canvas 铺满后
   曾对 x/y/w/h 各自插值：全国框 1000:717 与各省 bbox 的比例都不同，动画期间整张
   地图被实时拉扁/拉长，落定才恢复 —— 这是「下钻不精致」的主因。
   现在框按画布比例 A 重算：全国框 = 罩住整张地图的最小等比框（居中，四周留白，
   同原型的 xMidYMid meet）；省级框 = 罩住该省 bbox（外扩 1.2 倍）的最小等比框。 */
const A_FALLBACK = MAP_PX_FALLBACK.w / MAP_PX_FALLBACK.h
function fullBox(A) {
  const w = Math.max(VB.w, VB.h * A)
  const h = Math.max(VB.h, VB.w / A)
  return { x: (VB.w - w) / 2, y: (VB.h - h) / 2, w, h }
}
/* 太小的省（上海/北京）不无限放大，露出简化棱角：最小 170×140 换算成等比的一边。 */
function provBox(p, A) {
  const b = p.b
  const w = Math.max(b[2] * 1.2, b[3] * 1.2 * A, 170, 140 * A)
  const h = w / A
  const cx = b[0] + b[2] / 2
  const cy = b[1] + b[3] / 2
  const x = w >= VB.w ? (VB.w - w) / 2 : Math.min(Math.max(cx - w / 2, -20), VB.w + 20 - w)
  const y = h >= VB.h ? (VB.h - h) / 2 : Math.min(Math.max(cy - h / 2, -20), VB.h + 20 - h)
  return { x, y, w, h }
}
const FULL_FALLBACK = fullBox(A_FALLBACK)

/* cubic-bezier(.16,.84,.38,1) 求值器：牛顿迭代解 x(t)=x，发散时退二分。
   与全站入场动画同一条曲线 —— 快起慢收，落定不顿。 */
function easeFly(x) {
  const x1 = 0.16, y1 = 0.84, x2 = 0.38, y2 = 1
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const fx = (t) => ((ax * t + bx) * t + cx) * t
  const fy = (t) => ((ay * t + by) * t + cy) * t
  const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx
  let t = x
  for (let i = 0; i < 6; i += 1) {
    const err = fx(t) - x
    if (Math.abs(err) < 1e-4) break
    const d = dfx(t)
    if (Math.abs(d) < 1e-6) { t = -1; break }
    t -= err / d
  }
  if (t < 0 || t > 1) {
    let lo = 0, hi = 1
    for (let i = 0; i < 24; i += 1) {
      t = (lo + hi) / 2
      if (fx(t) < x) lo = t; else hi = t
    }
  }
  return fy(t)
}

export default function CityPage() {
  const [records] = useRecords()
  const [drill, setDrill] = React.useState(null)
  const [backupOpen, setBackupOpen] = React.useState(false)
  /* 城市排行默认只露前几座，其余收起来（22 座全列会把地图挤出首屏） */
  const [rankOpen, setRankOpen] = React.useState(false)
  const [box, setBox] = React.useState(FULL_FALLBACK)
  const [moving, setMoving] = React.useState(false)
  /* 画布实测尺寸：标签盒百分比的换算基准（首帧用 fallback，量到后覆盖） */
  const [mapPx, setMapPx] = React.useState(MAP_PX_FALLBACK)

  const canvasRef = React.useRef(null)
  const ctxRef = React.useRef(null)
  const sizeRef = React.useRef({ w: 0, h: 0 })
  const boxRef = React.useRef(box)
  boxRef.current = box
  const pinsRef = React.useRef([])
  /* 上一次补间的目标 active：区分「下钻/返回」（补间）与「画布比例校正」（直落） */
  const lastActiveRef = React.useRef(null)
  /* moving 的 ref 镜像：draw 是 useCallback，捕不到当轮的 moving 状态值 */
  const movingRef = React.useRef(moving)
  movingRef.current = moving

  const groups = fpGroupByCity(records)
  const cities = groups.filter((g) => g.key !== '__none__')
  const none = groups.filter((g) => g.key === '__none__')[0] || null
  /* 城市排行的归一基准：榜首笔数。只有 1 座城时不显示这一块（没有「排行」可言）。
     默认展示的行数：5 座 —— 连同地图一起正好落在首屏内。 */
  const rankMax = cities.length ? cities[0].count : 0

  /* provGroups/provHas 记忆化：draw 以 provHas 为依赖，需引用稳定 ——
     若每次渲染新建对象，无记录变化的重渲染（下钻、moving 切换）也会
     重建 draw 触发整幅重铺。计算统一从 records 派生，只随记录变化重算。 */
  const provGroups = React.useMemo(
    () => fpGroupByProvince(fpGroupByCity(records).filter((g) => g.key !== '__none__')),
    [records],
  )
  const provHas = React.useMemo(() => {
    const m = {}
    provGroups.forEach((p) => { m[p.prov] = p })
    return m
  }, [provGroups])
  const cur = drill ? provHas[drill] || null : null
  const active = cur ? drill : null
  const offmap = cities.filter((g) => !fpCityXY(g.city))
  const head = active
    ? provShort(active) + ' ' + cur.cities.length + ' 城 ' + cur.count + ' 笔'
    : cities.length + ' 城 ' + records.length + ' 笔'

  const provInfo = active ? provRingsByN[active] || null : null
  /* A 跟画布实测走：首帧 fallback 比例，量到真实尺寸后校正一次（无动画直落）。
     box 与 target 恒与画布同比 —— 飞行全程 sx==sy，地图只平移和等比缩放，不变形。 */
  const A = mapPx.w / mapPx.h
  /* target 记忆化：provBox/fullBox 每次渲染都返回新对象，直接进 effect 依赖会让补间
     每帧跟着 setBox 重启（重跑 → 直落终点，动画被打断）。provInfo 取自模块级
     provRings（稳定引用）、A 是数值 —— 身份只随下钻切换与画布测量变化，与原依赖等价。 */
  const target = React.useMemo(
    () => (provInfo ? provBox(provInfo, A) : fullBox(A)),
    [provInfo, A],
  )

  /* 下钻补间：360ms 快起慢收（cubic-bezier(.16,.84,.38,1)，与全站入场同拍，收尾不顿），
     画布节点的 requestAnimationFrame 驱动（没有则退全局 rAF，再退 16ms 定时器）。
     过渡期间整体打上 moving 标记 —— 标签层只随地图淡出，
     不跟着补间重算位置（否则标签会集体挤回边缘，读起来像整版出错）。
     只有「下钻/返回」才补间；画布比例校正（量到真实尺寸）直接落位，不惊动用户。 */
  React.useEffect(() => {
    const from = boxRef.current
    const to = target
    if (from.x === to.x && from.y === to.y && from.w === to.w && from.h === to.h) {
      lastActiveRef.current = active
      return undefined
    }
    const drilled = lastActiveRef.current !== active
    lastActiveRef.current = active
    if (!drilled) { setBox(to); return undefined }

    setMoving(true)
    const node = canvasRef.current
    const hasNodeRaf = !!(node && typeof node.requestAnimationFrame === 'function')
    const hasGlobalRaf = typeof requestAnimationFrame === 'function'
    let id = 0
    let start = 0
    const schedule = (cb) => {
      if (hasNodeRaf) id = node.requestAnimationFrame(cb)
      else if (hasGlobalRaf) id = requestAnimationFrame(cb)
      else id = setTimeout(cb, 16)
    }
    const cancel = () => {
      if (hasNodeRaf && typeof node.cancelAnimationFrame === 'function') node.cancelAnimationFrame(id)
      else if (hasGlobalRaf) cancelAnimationFrame(id)
      else clearTimeout(id)
    }
    const step = (ts) => {
      /* 时间戳只在同源间取差：rAF 给高程时间戳、定时器给不到 → 落 Date.now()，
         start 与后续每帧同源，混用也不影响差值。 */
      const now = typeof ts === 'number' ? ts : Date.now()
      if (!start) start = now
      const k = Math.min(1, (now - start) / 360)
      const e = easeFly(k)
      setBox(k >= 1 ? to : {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        w: from.w + (to.w - from.w) * e,
        h: from.h + (to.h - from.h) * e,
      })
      if (k < 1) schedule(step)
      else setMoving(false)
    }
    schedule(step)
    return cancel
  }, [active, mapPx, target])

  /* —— 标签计算：全国省标签压质心（不推离），省内城市标签从锚点推离 —— */
  const toPct = (mx, my) => ({ ax: ((mx - box.x) / box.w) * 100, ay: ((my - box.y) / box.h) * 100 })

  /* 补间期间标签层是 opacity:0 的（见 .fp-map-moving），位置算了也看不见 ——
     每帧 setBox 都会走到这里，layoutLabels 是 250 轮 × O(n²) 的松弛排布，
     低端机上白算 360ms 会让下钻动画直接掉帧。补间中直接沿用上一次的 pins，
     落定后再按新 box 重算一次。 */
  const movingSkip = moving && pinsRef.current.length > 0

  const cityPins = []
  if (active && !movingSkip) {
    cur.cities.forEach((g) => {
      const xy = fpCityXY(g.city)
      if (!xy) return
      cityPins.push(Object.assign({ key: g.key, g, mx: xy.x, my: xy.y }, toPct(xy.x, xy.y)))
    })
    assignTiers(cityPins)
    cityPins.forEach((p) => sizePin(p, p.g.city.length, mapPx))
    layoutLabels(cityPins, true)
  }
  const provPins = []
  if (!active && !movingSkip) {
    provGroups.forEach((p) => {
      const info = provRingsByN[p.prov]
      if (!info) return
      provPins.push(
        Object.assign({ key: p.prov, p, mx: info.c[0], my: info.c[1] }, toPct(info.c[0], info.c[1])),
      )
    })
    assignTiers(provPins)
    provPins.forEach((p) => sizePin(p, provShort(p.p.prov).length, mapPx))
    layoutLabels(provPins, false)
  }
  const pins = movingSkip ? pinsRef.current : (active ? cityPins : provPins)
  pinsRef.current = pins

  /* —— Canvas 绘制：底图 + 引线。viewBox 与标签百分比共用同一个 box。 ——
     配色与线宽对齐原型 matcha 覆写（.fp-map-land / .fp-prov[data-*] / .fp-pin-lead）：
     陆地 100 档 #ebf4f0、有记录省 200 档 #d4e8df、当前省 700 档 #377257、
     省界 200 档 #c0ded0、引线 700 档 #377257。非等比缩放会拉歪线宽，
     按 (sx+sy)/2 补偿出原型 non-scaling-stroke 的恒定像素线宽。
     锚点圆点不画：DOM 的 .fp-pin-anchor 已经画了（带白圈、恒定 9px），
     Canvas 再 arc 一个会叠出双点且随缩放变大小。 */
  const draw = React.useCallback(() => {
    const ctx = ctxRef.current
    const { w: cw, h: ch } = sizeRef.current
    if (!ctx || !cw || !ch) return
    const b = boxRef.current
    const sx = cw / b.w
    const sy = ch / b.h
    /* 非等比缩放下的平均倍率：把地图单位线宽折算回设计稿恒定像素宽 */
    const norm = (sx + sy) / 2
    ctx.clearRect(0, 0, cw, ch)
    ctx.save()
    ctx.scale(sx, sy)
    ctx.translate(-b.x, -b.y)
    /* 省填充：陆地 / 有记录 / 当前下钻三档，与 CSS 的 data-has/data-cur 一致。 */
    provRings.forEach((p) => {
      const has = provHas[p.n] ? 1 : 0
      const isCur = active === p.n ? 1 : 0
      ctx.beginPath()
      p._rings.forEach((ring) => {
        ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.closePath()
      })
      ctx.fillStyle = isCur ? FP_COLORS.accentDeep : has ? FP_COLORS.tintThumb : FP_COLORS.tintA
      ctx.fill('evenodd')
      ctx.lineWidth = 1.2 / norm
      ctx.strokeStyle = isCur ? FP_COLORS.accentDeep : FP_COLORS.line
      ctx.stroke()
    })
    /* 引线：锚点 → 标签中心。补间期间标签层整体淡出（与 .fp-map-moving 同步），
       画布引线也要跟着停画，否则 CSS 淡掉了 DOM 层、画布层还留着引线悬空。 */
    if (!movingRef.current) {
      const list = pinsRef.current
      ctx.lineWidth = 1.5 / norm
      ctx.strokeStyle = FP_COLORS.accentDeep
      ctx.globalAlpha = 0.9
      list.forEach((p) => {
        const lx = b.x + (p.lx / 100) * b.w
        const ly = b.y + (p.ly / 100) * b.h
        ctx.beginPath()
        ctx.moveTo(p.mx, p.my)
        ctx.lineTo(lx, ly)
        ctx.stroke()
      })
      ctx.globalAlpha = 1
    }
    ctx.restore()
    /* provHas 在依赖里：记录增删后重渲染需重建 draw 才会重铺省色，
     旧闭包捕获的旧映射会让新增记录省的填充色停留不变。 */
  }, [active, provHas])

  React.useEffect(() => { draw() }, [draw, box])

  /* 取画布节点与尺寸（dpr 适配），失败则只显示标签层（不崩）。 */
  React.useEffect(() => {
    Taro.createSelectorQuery()
      .select('#fp-map-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const r = res && res[0]
        if (!r || !r.node) return
        canvasRef.current = r.node
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 2
        r.node.width = Math.round(r.width * dpr)
        r.node.height = Math.round(r.height * dpr)
        const ctx = r.node.getContext('2d')
        ctx.scale(dpr, dpr)
        ctxRef.current = ctx
        sizeRef.current = { w: r.width, h: r.height }
        /* 用实测画布尺寸覆盖标签盒换算基准（变了才 setState，避免无谓重排） */
        setMapPx((prev) => (
          Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
            ? prev
            : { w: r.width, h: r.height }
        ))
        draw()
      })
  }, [draw])

  /* 省份点击命中：tap 相对画布坐标 → viewBox 坐标 → 逐省射线法。 */
  function onMapTap(e) {
    const detail = e.detail || {}
    const x = detail.x
    const y = detail.y
    if (x === undefined || y === undefined) return
    const b = boxRef.current
    const mx = b.x + (x / sizeRef.current.w) * b.w
    const my = b.y + (y / sizeRef.current.h) * b.h
    if (active) return /* 省内视图不处理底图点击 */
    for (let i = 0; i < provRings.length; i += 1) {
      const p = provRings[i]
      if (provHas[p.n] && inProv(p, mx, my)) {
        setDrill(p.n)
        return
      }
    }
  }

  function drillTo(prov) { setDrill(prov) }

  /* —— 备份 / 恢复（原首页头部，因头部拥挤迁到本页底部）——
     导出：写文件 + 让用户把它转存出去。小程序写不出沙盒，
     wx.env.USER_DATA_PATH 是唯一可写位置；写完用 openDocument 打开
     （右上角菜单里能「转发给朋友」），这是小程序把文件交到用户手里的唯一通路。 */
  function handleExport() {
    const r = fpWriteBackupFile()
    if (!r.ok) {
      Taro.showModal({
        title: '导出失败',
        content: r.error || '写不出文件',
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    if (typeof Taro.openDocument === 'function') {
      Taro.openDocument({ filePath: r.filePath, showMenu: true }).catch(() => {
        Taro.showModal({
          title: '备份已生成',
          content: '文件写在：' + r.filePath + '\n\n可在开发者工具的「文件」面板里取出。',
          showCancel: false,
          confirmText: '知道了',
        })
      })
    } else {
      Taro.showModal({
        title: '备份已生成',
        content: '文件写在：' + r.filePath,
        showCancel: false,
        confirmText: '知道了',
      })
    }
  }

  /* 导入：chooseMessageFile 从聊天记录里挑 .json ——
     小程序读不到任意目录，这是唯一入口（所以导出的文件要先发给「文件传输助手」）。 */
  function handleImport() {
    fpPickBackupFile().then((picked) => {
      /* error 为空串表示用户取消，不弹错 */
      if (!picked.ok) {
        if (picked.error) {
          Taro.showModal({
            title: '导入失败',
            content: picked.error,
            showCancel: false,
            confirmText: '知道了',
          })
        }
        return
      }
      const data = picked.data
      /* 覆盖前必须问：导入是破坏性的，现有记录会被顶掉 */
      Taro.showModal({
        title: '用备份覆盖现在的手账？',
        content: '现有 ' + records.length + ' 笔会被备份里的 ' + data.records.length + ' 笔替换。',
        confirmText: '覆盖',
        cancelText: '算了',
        confirmColor: FP_COLORS.danger,
      }).then((res) => {
        if (!res.confirm) return
        const result = fpRestoreBackup(data)
        if (!result.ok) {
          Taro.showModal({
            title: '没恢复成功',
            content: result.error,
            showCancel: false,
            confirmText: '知道了',
          })
          return
        }
        /* 拿 result.records 刷新内存 store：store 有 cache，
           不刷新的话界面还显示导入前那份。 */
        reloadRecords()
        setBackupOpen(false)
        Taro.showToast({
          title: '已恢复 ' + result.count + ' 笔',
          icon: 'none',
          duration: 2000,
        })
      }).catch(() => {})
    })
  }

  return (
    <View className="fp-app fp-tabbar-page" style={fpAppRootStyle()}>
      <View className="fp-head">
        <View className="fp-head-bar">
          <Text className="fp-title">{FP_VARIANT.cityTitle}</Text>
          <Text className="fp-head-meta">{head}</Text>
        </View>
      </View>

      <View className="fp-scroll fp-enter">
        {records.length === 0 ? (
          <Empty variant="intro">吃过的地方会自己落在这张地图上。</Empty>
        ) : null}
        {pins.length ? (
          <View className={'fp-map' + (moving ? ' fp-map-moving' : '')}>
            <Canvas
              id="fp-map-canvas"
              type="2d"
              className="fp-map-canvas"
              onTap={onMapTap}
            />
            {active ? (
              <View
                className="fp-mapback"
                title={'回到全国视图（' + provShort(active) + ' 共 ' + cur.count + ' 笔）'}
                hoverClass="fp-hover"
                onClick={() => setDrill(null)}
              >
                <Text>← 全国</Text>
              </View>
            ) : null}
            {pins.map((p) => (
              <View
                key={p.key}
                className="fp-pin-anchor"
                style={{ left: p.ax + '%', top: p.ay + '%' }}
                aria-hidden="true"
              />
            ))}
            {active
              ? pins.map((p) => (
                <View
                  key={p.key}
                  className={'fp-pin fp-pin-' + p.tier}
                  /* 居中 + 倾角必须写在同一条内联 transform：只写 rotate 会覆盖掉 CSS 的
                     translate(-50%,-50%)，标签变左上角定位、整体向右下偏半个身位被框裁掉 */
                  style={{
                    left: p.lx + '%',
                    top: p.ly + '%',
                    transform: 'translate(-50%, -50%) rotate(' + p.tilt + 'deg)',
                  }}
                  title={'进「' + p.g.city + '」的详情（' + p.g.count + ' 笔）'}
                  onClick={() => routeTo.cityDetail(p.key)}
                >
                  <Text className="fp-pin-name">{p.g.city}</Text>
                  <Text className="fp-pin-count">{p.g.count} 笔</Text>
                </View>
              ))
              : pins.map((p) => (
                <View
                  key={p.key}
                  className={'fp-pin fp-pin-' + p.tier}
                  /* 同上：内联 transform 必须自带 translate(-50%,-50%) */
                  style={{
                    left: p.lx + '%',
                    top: p.ly + '%',
                    transform: 'translate(-50%, -50%) rotate(' + p.tilt + 'deg)',
                  }}
                  title={'查看' + p.p.prov + '（' + p.p.count + ' 笔）'}
                  onClick={() => drillTo(p.key)}
                >
                  {p.tier === 'dot' ? (
                    <Text className="fp-pin-count">{p.p.count}</Text>
                  ) : p.tier === 'pill' ? (
                    <Text className="fp-pin-name">{provShort(p.p.prov)} {p.p.count}</Text>
                  ) : (
                    <View className="fp-pin-stack">
                      <Text className="fp-pin-name">{provShort(p.p.prov)}</Text>
                      <Text className="fp-pin-count">{p.p.count}</Text>
                    </View>
                  )}
                </View>
              ))}
          </View>
        ) : null}

        {/* 城市排行：地图回答「在哪」，这一块回答「去了多少次」。
            笔数降序（fpGroupByCity 已排好），条宽按榜首归一 —— 榜首总是满格，
            量级差一眼可读。整行可点，与地图图钉、下方「没测坐标」行
            走同一个入口：三处都进这座城市的城市详情页。
            默认只露前 5 座，其余收在「还有 N 座」里 —— 22 座全列会把地图挤出首屏。 */}
        {cities.length > 1 ? (
          <View className="fp-rank">
            <View className="fp-rank-head">
              <Text className="fp-rank-title">城市排行</Text>
              <Text className="fp-rank-note">{cities.length} 座</Text>
            </View>
            {rankOpen
              ? cities.map((g, i) => (
                <View
                  key={g.key}
                  className="fp-rank-row"
                  hoverClass="fp-hover"
                  onClick={() => routeTo.cityDetail(g.key)}
                >
                  <Text className="fp-rank-no">{String(i + 1).padStart(2, '0')}</Text>
                  <Text className="fp-rank-name">{g.city}</Text>
                  <View className="fp-rank-bar">
                    <i style={{ width: (g.count / rankMax * 100).toFixed(1) + '%' }} />
                  </View>
                  <Text className="fp-rank-count">{g.count}</Text>
                </View>
              ))
              : cities.slice(0, RANK_TOP).map((g, i) => (
                <View
                  key={g.key}
                  className="fp-rank-row"
                  hoverClass="fp-hover"
                  onClick={() => routeTo.cityDetail(g.key)}
                >
                  <Text className="fp-rank-no">{String(i + 1).padStart(2, '0')}</Text>
                  <Text className="fp-rank-name">{g.city}</Text>
                  <View className="fp-rank-bar">
                    <i style={{ width: (g.count / rankMax * 100).toFixed(1) + '%' }} />
                  </View>
                  <Text className="fp-rank-count">{g.count}</Text>
                </View>
              ))}
            {cities.length > RANK_TOP ? (
              <View
                className={'fp-rank-row fp-rank-more' + (rankOpen ? ' fp-on' : '')}
                hoverClass="fp-hover"
                onClick={() => setRankOpen(!rankOpen)}
              >
                <Text className="fp-rank-no">···</Text>
                <Text className="fp-rank-name">
                  {rankOpen ? '收起排行' : '还有 ' + (cities.length - RANK_TOP) + ' 座城'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* 交互提示：内联明细面板已让位给城市详情页 —— 图钉 / 排行 / 下面两行
            三个入口点城市，都 push 同一个二级页（返回时下钻状态还在）。 */}
        <View className="fp-cityhint">
          {active
            ? '点城市进它的详情页；「← 全国」返回省级视图。'
            : records.length > 0 && cities.length === 0
              /* 全部记录都没带位置时，地图和排行都空着 ——
                 再教「点有记录的省份下钻」就是一块指不到地方的路牌。 */
              ? '这批记录都没带位置 · 打卡时选上城市，地图和排行才有地方落。'
              : '点有记录的省份下钻，再点城市看那座城的详情。'}
        </View>

        {offmap.map((g) => (
          <View
            key={g.key}
            className="fp-nocity"
            hoverClass="fp-hover"
            onClick={() => routeTo.cityDetail(g.key)}
          >
            <Text>「{g.city}」不在地图上（{g.count} 笔）</Text>
            <Icon name="chevron" size={13} />
          </View>
        ))}
        {none ? (
          <View
            className="fp-nocity"
            hoverClass="fp-hover"
            onClick={() => routeTo.cityDetail(none.key)}
          >
            <Text>还有 {none.count} 笔没填城市</Text>
            <Icon name="chevron" size={13} />
          </View>
        ) : null}

        {/* 备份入口：从首页头部挪来 —— 头部让给搜索/筛选；备份是低频但
            「迟早要用、用时找不到最惨」的功能，放本页底部的数据管理位，
            空状态（正需要恢复备份时）也始终可达。 */}
        <View className="fp-backuprow fp-backuprow-foot">
          <View
            className="fp-backup-btn"
            hoverClass="fp-hover"
            onClick={() => setBackupOpen(true)}
          >
            <Icon name="download" size={13} />
            <Text>备份 / 恢复</Text>
          </View>
        </View>
      </View>

      <FpTabBar active="city" dockCta={FP_VARIANT.dockCta} />

      {/* 备份面板：遮罩 + 底部抽屉。做成普通 View 而不是组件库弹窗 ——
          只有两个按钮，不值得为它引一个依赖。 */}
      {backupOpen ? (
        <View className="fp-sheet-mask" onClick={() => setBackupOpen(false)}>
          <View className="fp-sheet" onClick={(e) => e.stopPropagation()}>
            <View className="fp-sheet-title">备份 / 恢复</View>
            <View className="fp-sheet-note">
              记录和照片都只存在这台手机上。换手机、清缓存、删小程序都会丢，
              建议偶尔导出一份存着。
            </View>
            <View
              className="fp-sheet-item"
              hoverClass="fp-hover"
              onClick={() => { setBackupOpen(false); handleExport() }}
            >
              <Icon name="download" size={18} />
              <View className="fp-sheet-item-text">
                <Text className="fp-sheet-item-name">导出备份</Text>
                <Text className="fp-sheet-item-sub">
                  {records.length} 笔记录，含照片
                </Text>
              </View>
            </View>
            <View
              className="fp-sheet-item"
              hoverClass="fp-hover"
              onClick={handleImport}
            >
              <Icon name="upload" size={18} />
              <View className="fp-sheet-item-text">
                <Text className="fp-sheet-item-name">从备份恢复</Text>
                <Text className="fp-sheet-item-sub">会覆盖现在的手账</Text>
              </View>
            </View>
            <View
              className="fp-sheet-cancel"
              hoverClass="fp-hover"
              onClick={() => setBackupOpen(false)}
            >
              取消
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
