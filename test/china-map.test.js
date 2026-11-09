/* china-map.js 的路径解析 + 命中判定：城市页 Canvas 画得对不对、点省能不能点中，
   全押在这两个函数上。它们原本写在 pages/city/index.jsx 里（不导出），
   这里放一份同源实现并逐字注释「改动要同步」——比为了可测把页面逻辑抽出去更稳。 */
/* 数据形状：FP_CHINA_PROVS = [{ n: '省名', d: 'M x y L ... Z ...', b: [x,y,w,h], c: [cx,cy] }] */
import { FP_CHINA_PROVS, FP_CHINA_MAP, FP_CITY_PROV } from '../src/data/china-map'
import { fpCityXY, FP_CITY_GEO } from '../src/data/core'

/* —————— 与 src/pages/city/index.jsx 的 parsePath 逐字一致，改一处必须改另一处 —————— */
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

/* —————— 与 src/pages/city/index.jsx 的 inRing 逐字一致 —————— */
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

/* evenodd：所有环里命中奇数次 = 内部 */
function inProv(rings, x, y) {
  let hits = 0
  rings.forEach((r) => { if (inRing(r, x, y)) hits += 1 })
  return hits % 2 === 1
}

describe('china-map 数据', () => {
  it('34 省齐全，每条都有路径、bbox、质心', () => {
    expect(FP_CHINA_PROVS.length).toBe(34)
    FP_CHINA_PROVS.forEach((p) => {
      expect(typeof p.n).toBe('string')
      expect(p.d.length).toBeGreaterThan(30)
      expect(p.b).toHaveLength(4)
      expect(p.c).toHaveLength(2)
    })
  })

  it('最小省份（澳门）路径很短但仍可解析成环', () => {
    const ao = FP_CHINA_PROVS.filter((p) => p.n === '澳门特别行政区')[0]
    expect(ao.d.length).toBeLessThan(60)
    expect(parsePath(ao.d).length).toBeGreaterThan(0)
  })

  it('bbox 与 viewBox 量级一致（都在同一坐标系里）', () => {
    const VB = FP_CHINA_MAP || { w: 1000, h: 717 }
    FP_CHINA_PROVS.forEach((p) => {
      expect(p.b[2]).toBeLessThanOrEqual(VB.w)
      expect(p.b[3]).toBeLessThanOrEqual(VB.h)
    })
  })

  it('FP_CITY_PROV 收录的城市都能在 FP_CHINA_PROVS 找到对应省', () => {
    const names = new Set(FP_CHINA_PROVS.map((p) => p.n))
    const miss = Object.values(FP_CITY_PROV).filter((v) => !names.has(v))
    expect(miss).toEqual([])
  })

  /* FP_CITY_PROV 是「城市经纬度落在哪个省」的点-面查询结果（生成脚本的产物）。
     生成脚本不在仓库，这份表只能手工维护 —— 那就必须能被反验：
     用 inRing 重新算一遍每个收录城市的归属，与表里的值对不上就说明表被改坏了。
     这比「表自己能自洽」强得多：它验的是表与地图路径的一致性。 */
  it('FP_CITY_PROV 的每个城市都用点-面查询反验通过', () => {
    const byName = {}
    FP_CHINA_PROVS.forEach((p) => { byName[p.n] = parsePath(p.d) })
    const bad = []
    Object.keys(FP_CITY_PROV).forEach((city) => {
      const xy = fpCityXY(city)
      if (!xy) { bad.push(city + '（无经纬度）'); return }
      const hit = Object.keys(byName).filter((n) => inProv(byName[n], xy.x, xy.y))
      /* 边界城市可能同时压在两个省的路径上（省界共点），只要表里的值在命中集里就算对 */
      if (hit.length && hit.indexOf(FP_CITY_PROV[city]) < 0) {
        bad.push(city + '：表说 ' + FP_CITY_PROV[city] + '，实测命中 ' + hit.join('/'))
      }
    })
    expect(bad).toEqual([])
  })
})

describe('parsePath', () => {
  it('单环路径解析出坐标对', () => {
    const rings = parsePath('M 0 0 L 10 0 L 10 10 Z')
    expect(rings).toHaveLength(1)
    expect(rings[0]).toEqual([[0, 0], [10, 0], [10, 10]])
  })

  it('多个大写 M 开新环（海岛 / 飞地）', () => {
    const rings = parsePath('M 0 0 L 5 0 L 5 5 Z M 100 100 L 110 100 L 110 110 Z')
    expect(rings).toHaveLength(2)
    expect(rings[1][0]).toEqual([100, 100])
  })

  it('Z 之后跟随的 M 也算新环', () => {
    const rings = parsePath('M 0 0 L 5 0 L 5 5 Z M 20 20 L 25 20 L 25 25 Z')
    expect(rings).toHaveLength(2)
  })

  it('少于三个点的碎片被丢掉', () => {
    expect(parsePath('M 0 0 L 1 1')).toEqual([])
    /* 三个点是一条退化线段（面积 0），但 parsePath 的约定是「够 3 个点就成环」，
       由调用方的 inRing 判定命中 —— 线段没有面积，射线法永不命中，等价于丢弃。
       这里锁的是「不炸、不产出半环」而不是形状语义。 */
    const three = parsePath('M 0 0 L 1 1 L 2 2')
    expect(three.length).toBeLessThanOrEqual(1)
    if (three.length) expect(inRing(three[0], 1, 1)).toBe(false)
  })

  it('负数与小数坐标', () => {
    const rings = parsePath('M -1.5 2.25 L 3 -4 L 0 0 Z')
    expect(rings[0]).toEqual([[-1.5, 2.25], [3, -4], [0, 0]])
  })

  it('34 省真实路径全部能解析出环', () => {
    FP_CHINA_PROVS.forEach((p) => {
      const rings = parsePath(p.d)
      expect(rings.length).toBeGreaterThan(0)
      rings.forEach((r) => expect(r.length).toBeGreaterThanOrEqual(3))
    })
  })
})

describe('inRing / inProv 命中判定', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]]

  it('内部命中、外部不命中', () => {
    expect(inRing(square, 5, 5)).toBe(true)
    expect(inRing(square, 15, 5)).toBe(false)
    expect(inRing(square, 5, 15)).toBe(false)
  })

  it('evenodd：嵌套环按奇偶计数（外环+内环 = 洞）', () => {
    /* 外方 0..20，内方 5..15：中心在两个环内 → 命中 2 次 → 算外部（洞） */
    const outer = [[0, 0], [20, 0], [20, 20], [0, 20]]
    const inner = [[5, 5], [15, 5], [15, 15], [5, 15]]
    expect(inProv([outer, inner], 10, 10)).toBe(false)
    expect(inProv([outer, inner], 2, 2)).toBe(true)
    expect(inProv([outer, inner], 17, 17)).toBe(true)
  })

  it('真实省份：绝大多数省的质心落在自己省内', () => {
    /* 质心算的是 bbox 几何中心，对碎形 / 狭长省会落到界外 —— 澳门（多岛）、
       甘肃（狭长走廊）都如此；香港的质心恰好落在岛上，能命中。
       锁的是「绝大多数自洽」，不是「全部」：对碎形省要求质心命中不合理。 */
    const miss = []
    FP_CHINA_PROVS.forEach((p) => {
      if (!inProv(parsePath(p.d), p.c[0], p.c[1])) miss.push(p.n)
    })
    expect(miss.length).toBeLessThanOrEqual(3)
    expect(miss).toContain('澳门特别行政区')
  })

  it('点不中任何省：太平洋中心', () => {
    const rings = FP_CHINA_PROVS.map((p) => parsePath(p.d))
    const inAny = rings.some((r) => inProv(r, 150, 25))
    expect(inAny).toBe(false)
  })
})

describe('城市坐标落在地图范围内', () => {
  it('所有 FP_CITY_GEO 投影后都落在 viewBox 内', () => {
    const VB = FP_CHINA_MAP || { w: 1000, h: 717 }
    Object.keys(FP_CITY_GEO).forEach((city) => {
      const xy = fpCityXY(city)
      expect(xy).not.toBeNull()
      expect(xy.x).toBeGreaterThanOrEqual(0)
      expect(xy.x).toBeLessThanOrEqual(VB.w)
      expect(xy.y).toBeGreaterThanOrEqual(0)
      expect(xy.y).toBeLessThanOrEqual(VB.h)
    })
  })
})
