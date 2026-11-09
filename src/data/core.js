/* 核心派生逻辑：格式化、分组、聚合、店铺实体、行政区划查询。
   与原型 data.jsx 的纯函数逐条对应；Taro 的 storage API 是同步的，所以这些函数保持同步。 */
import Taro from '@tarojs/taro'
import { FP_SHOP_ENTITIES } from './demo-records'
import { FP_AREAS } from './areas'
import { FP_CITY_PROV } from './china-map'

export function fpPad(n) {
  return n < 10 ? '0' + n : String(n)
}

/* 当地时区的 ISO 串（分钟精度，秒恒为 00）。
   新建记录的「现在」必须现算：写死一个常量会让之后所有新记录都落在那一天，
   显示也跟着说「10月9日」而不是「今天」。 */
export function fpNowIso() {
  const d = new Date()
  return d.getFullYear() + '-' + fpPad(d.getMonth() + 1) + '-' + fpPad(d.getDate())
    + 'T' + fpPad(d.getHours()) + ':' + fpPad(d.getMinutes()) + ':00'
}

/* 时间：今天只写时分，其它日子写月日。
   「今天」按当前真实时刻判 —— 判定的基准是打开小程序这一刻，
   不是内置示例数据的那一天（FP_NOW 已随之移除）。 */
export function fpWhen(iso) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  const hm = fpPad(d.getHours()) + ':' + fpPad(d.getMinutes())
  return sameDay ? '今天 ' + hm : fpPad(d.getMonth() + 1) + '月' + fpPad(d.getDate()) + '日 ' + hm
}

export function fpStatsText(tpl, stats) {
  return String(tpl).replace('N', stats.count).replace('M', stats.cities)
}

/* 按年月倒序分组，月份标题各处共用。 */
export function fpGroupByMonth(records) {
  const sorted = records.slice().sort((a, b) => (a.at < b.at ? 1 : -1))
  const out = []
  sorted.forEach((r) => {
    const d = new Date(r.at)
    const key = d.getFullYear() + '-' + fpPad(d.getMonth() + 1)
    let g = out[out.length - 1]
    if (!g || g.key !== key) {
      g = { key, year: d.getFullYear(), month: d.getMonth() + 1, items: [] }
      out.push(g)
    }
    g.items.push(r)
  })
  return out
}

/* 按城市聚合 —— 「旅行」不是一个实体，就是记录按城市聚起来之后的说法。
   排序：笔数多的在前，笔数相同按城市名；没有城市的记录单独归到最后一组。 */
export function fpGroupByCity(records) {
  const buckets = {}
  records.forEach((r) => {
    const key = r.city || '__none__'
    if (!buckets[key]) buckets[key] = { key, city: r.city, items: [] }
    buckets[key].items.push(r)
  })
  const out = Object.keys(buckets).map((k) => buckets[k])
  out.forEach((g) => {
    const sorted = g.items.slice().sort((a, b) => (a.at < b.at ? 1 : -1))
    g.items = sorted
    g.count = sorted.length
    g.latest = sorted[0].at
  })
  out.sort((a, b) => {
    if (a.key === '__none__') return 1
    if (b.key === '__none__') return -1
    if (b.count !== a.count) return b.count - a.count
    return a.city < b.city ? -1 : 1
  })
  return out
}

/* 城市 → 省。china-map.js 生成时已用点-面包含判断算好，这里只查表：
   没收录的城市返回 null，调用方按「不上地图」降级。 */
export function fpProvOfCity(city) {
  return (city && FP_CITY_PROV[city]) || null
}

/* 城市分组 → 省分组（全国视图的省级聚合），按笔数降序。 */
export function fpGroupByProvince(cityGroups) {
  const buckets = {}
  cityGroups.forEach((g) => {
    const prov = fpProvOfCity(g.city)
    if (!prov) return
    if (!buckets[prov]) buckets[prov] = { prov, cities: [], items: [], latest: g.latest }
    buckets[prov].cities.push(g)
    buckets[prov].items = buckets[prov].items.concat(g.items)
    if (g.latest > buckets[prov].latest) buckets[prov].latest = g.latest
  })
  const out = Object.keys(buckets).map((k) => {
    const b = buckets[k]
    b.count = b.items.length
    return b
  })
  out.sort((a, b) => b.count - a.count || (a.prov < b.prov ? -1 : 1))
  return out
}

export function fpStats(records) {
  const shops = {}
  const cities = {}
  records.forEach((r) => {
    if (r.shop) shops[r.shop] = (shops[r.shop] || 0) + 1
    if (r.city) cities[r.city] = (cities[r.city] || 0) + 1
  })
  return { count: records.length, shops: Object.keys(shops).length, cities: Object.keys(cities).length }
}

/* ------------------------------------------------------------- 店铺实体
   店不单独维护名单：记录按「名字@城市」聚起来就是店（和城市页同一套思路）。
   去过几次、平均分、最近一次都从记录实时算，不会存两份对不上。 */
export function fpShopKey(name, city) {
  return name + '@' + (city || '')
}

export function fpBuildShops(records) {
  const buckets = {}
  ;(records || []).forEach((r) => {
    if (!r.shop) return
    const key = fpShopKey(r.shop, r.city)
    if (!buckets[key]) buckets[key] = { key, name: r.shop, city: r.city, items: [] }
    buckets[key].items.push(r)
  })
  const out = Object.keys(buckets).map((k) => {
    const s = buckets[k]
    const sorted = s.items.slice().sort((a, b) => (a.at < b.at ? 1 : -1))
    s.items = sorted
    s.visits = sorted.length
    s.avg = sorted.reduce((sum, r) => sum + r.rating, 0) / sorted.length
    s.lastAt = sorted[0].at
    return s
  })
  out.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
  return out
}

/* 录入页「店」的候选：真实记录里出现过的店，带上城市/区县 —— 选中一并补位置，
   这是去重的关键（手打「马旺子」和「马旺子川小馆」会裂成两家店）。 */
export function fpShopCandidates(records) {
  const seen = {}
  const out = []
  ;(records || []).forEach((r) => {
    if (r.shop && !seen[r.shop]) {
      seen[r.shop] = true
      out.push({ name: r.shop, city: r.city || null, district: r.district || null })
    }
  })
  if (out.length) return out
  return FP_SHOP_ENTITIES.map((n) => ({ name: n, city: null, district: null }))
}

/* 「最近去过」快捷城市：从记录里现算，一行常驻，最多 5 个。 */
export function fpRecentCities(records, limit) {
  const out = []
  const seen = {}
  ;(records || []).forEach((r) => {
    const c = r.city ? r.city.trim() : ''
    if (c && !seen[c]) { seen[c] = true; out.push(c) }
  })
  return out.slice(0, limit || 12)
}

/* ------------------------------------------------------------- 行政区划
   数据固化在 areas.js（34 省 · 394 市 · 2946 区县）。
   区县只作展示与搜索字段，不参与地图聚合、店铺去重与统计。 */
export function fpProvinces() {
  return Object.keys(FP_AREAS)
}
export function fpAreaCities(prov) {
  return FP_AREAS[prov] ? Object.keys(FP_AREAS[prov]) : []
}

/* 城市 → 省 的反查表：建一次，之后 O(1)。
   areas.js 是「省 → 市 → 区县」两层嵌套，反查本要逐省查键（34 次属性访问）。
   录入页每次渲染都要算区县候选，反查就跟着跑一遍 —— 400 个市建表只要一次。 */
const FP_CITY_TO_PROV = {}
Object.keys(FP_AREAS).forEach((prov) => {
  Object.keys(FP_AREAS[prov]).forEach((city) => {
    /* 直辖市同名的市不覆盖省本身：上海 → 上海 已由「省键 === 市键」天然成立 */
    if (FP_CITY_TO_PROV[city] === undefined) FP_CITY_TO_PROV[city] = prov
  })
})

/* 城市 → 省：查不到返回 null（不猜它属于哪个省）。 */
export function fpAreaProvOfCity(city) {
  if (!city) return null
  return FP_CITY_TO_PROV[city] !== undefined ? FP_CITY_TO_PROV[city] : null
}
export function fpAreaDistricts(prov, city) {
  const line = FP_AREAS[prov] && FP_AREAS[prov][city]
  return line ? line.split(' ') : []
}

/* 区县候选：先取该城市记录里真实出现过的区县，再补全国表里这座城的全部区县。 */
export function fpDistrictCands(records, city) {
  if (!city) return []
  const seen = {}
  const out = []
  ;(records || []).forEach((r) => {
    const d = r.district ? r.district.trim() : ''
    if (d && r.city === city && !seen[d]) { seen[d] = true; out.push(d) }
  })
  fpAreaDistricts(fpAreaProvOfCity(city), city).forEach((d) => {
    if (!seen[d]) { seen[d] = true; out.push(d) }
  })
  return out
}

/* 省名短写：广西壮族自治区 → 广西、上海市 → 上海（贴纸标签放不下全名） */
export function provShort(n) {
  return n.replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/, '') || n
}

/* --------------------------------------------------------- 城市经纬度 → 地图坐标
   投影与 china-map.js 生成时的公式逐字一致（等距圆柱 + cos(35°) 纬度校正，
   LNG0=73 / LNG1=136 / LAT0=54.5），图钉和轮廓天然对齐。 */
const FP_CHINA_LNG0 = 73
const FP_CHINA_LNG1 = 136
const FP_CHINA_LAT0 = 54.5
const FP_CHINA_K = Math.cos((35 * Math.PI) / 180)
const FP_CHINA_W = 1000
const FP_CHINA_SCALE = FP_CHINA_W / ((FP_CHINA_LNG1 - FP_CHINA_LNG0) * FP_CHINA_K)

export function fpProjectLngLat(lng, lat) {
  return {
    x: (lng - FP_CHINA_LNG0) * FP_CHINA_K * FP_CHINA_SCALE,
    y: (FP_CHINA_LAT0 - lat) * FP_CHINA_SCALE,
  }
}

/* 演示与常用城市坐标。没收录的城市不上地图（宁可降级也不猜坐标）——
   图钉落在海里比不放更糟。 */
export const FP_CITY_GEO = {
  成都: [104.07, 30.67], 乐山: [103.77, 29.35], 上海: [121.47, 31.23], 北京: [116.41, 39.9],
  重庆: [106.55, 29.56], 广州: [113.26, 23.13], 深圳: [114.06, 22.55], 杭州: [120.16, 30.27],
  南京: [118.8, 32.06], 西安: [108.94, 34.34], 武汉: [114.31, 30.59], 长沙: [112.94, 28.23],
  天津: [117.2, 39.13], 苏州: [120.58, 31.3], 青岛: [120.38, 36.07], 济南: [117.0, 36.65],
  郑州: [113.63, 34.75], 沈阳: [123.43, 41.8], 大连: [121.62, 38.91], 哈尔滨: [126.53, 45.8],
  长春: [125.32, 43.9], 福州: [119.3, 26.08], 厦门: [118.09, 24.48], 昆明: [102.83, 24.88],
  贵阳: [106.63, 26.65], 南宁: [108.37, 22.82], 海口: [110.2, 20.04], 三亚: [109.51, 18.25],
  拉萨: [91.11, 29.65], 乌鲁木齐: [87.62, 43.83], 兰州: [103.83, 36.06], 西宁: [101.78, 36.62],
  银川: [106.23, 38.49], 呼和浩特: [111.75, 40.84], 太原: [112.55, 37.87], 合肥: [117.28, 31.86],
  南昌: [115.86, 28.68], 宁波: [121.55, 29.87], 温州: [120.7, 28.0], 无锡: [120.3, 31.57],
  佛山: [113.12, 23.02], 东莞: [113.75, 23.04], 珠海: [113.55, 22.27], 汕头: [116.68, 23.35],
  洛阳: [112.45, 34.62], 开封: [114.31, 34.8], 扬州: [119.42, 32.39], 徐州: [117.18, 34.26],
  常州: [119.97, 31.81], 嘉兴: [120.76, 30.75], 绍兴: [120.58, 30.05], 金华: [119.65, 29.09],
  泉州: [118.68, 24.87], 桂林: [110.29, 25.27], 张家界: [110.48, 29.13], 遵义: [106.93, 27.73],
  绵阳: [104.68, 31.47], 宜宾: [104.63, 28.77], 自贡: [104.78, 29.35], 泸州: [105.44, 28.87],
  大理: [100.23, 25.6], 丽江: [100.23, 26.87], 敦煌: [94.66, 40.14], 平遥: [112.17, 37.2],
  台北: [121.52, 25.03], 高雄: [120.31, 22.63],
}

export function fpCityXY(city) {
  const g = FP_CITY_GEO[city]
  if (!g) return null
  return fpProjectLngLat(g[0], g[1])
}

/* 删除/撤销的纯函数：从数组里摘出来、再插回去。
   抽出来是为了能测 —— 撤销最容易错的两点：
   1. 插回的位置（不能一律塞到末尾，时间轴是按时间排的）
   2. 记录删完后再撤销，index 已经越界（要夹紧，不能 splice 出错）
   页面只负责 setState 与计时，不负责算位置。 */
export function fpRemoveRecord(records, id) {
  const list = Array.isArray(records) ? records : []
  const index = list.findIndex((r) => r && r.id === id)
  if (index < 0) return { records: list, index: -1, removed: null }
  return {
    records: list.slice(0, index).concat(list.slice(index + 1)),
    index,
    removed: list[index],
  }
}

export function fpInsertRecord(records, record, index) {
  const list = Array.isArray(records) ? records.slice() : []
  if (!record) return list
  /* 夹紧：期间可能又删了几笔，原来的 index 会越界 */
  const at = Math.min(Math.max(index | 0, 0), list.length)
  list.splice(at, 0, record)
  return list
}

/* 撤销窗口的完整状态机。放在这里而不是页面里，是因为页面里有两个
   「窗口结束」的出口（计时器到点 / 组件卸载），各自都要清照片 ——
   曾经漏掉后者，注释写着「照片照删」但代码只 clearTimeout，
   结果是删了记录、索引没了、文件永远留在持久区。
   把两条出口收进一个函数，页面就没有漏的机会了。

   adopt()  → 开始一个窗口，返回 token（快照）
   commit() → 窗口正常结束：清照片，返回 null
   rollback() → 用户点撤销 / 或根本还没删：不动照片，返回 null
   用法：const w = fpUndoWindow(); w.adopt(rec, own, idx); … w.commit() / w.rollback() */
export function fpUndoWindow(removePhotos) {
  let snapshot = null
  const drop = removePhotos || (() => {})
  return {
    adopt(record, photos, index) {
      snapshot = { record, photos, index }
      return snapshot
    },
    current() {
      return snapshot
    },
    /* 窗口结束：这才删照片。可重复调用（计时器与卸载都可能触发），
       第二次时 snapshot 已清空，自然不会重复删。 */
    commit() {
      const s = snapshot
      snapshot = null
      if (s && s.photos && s.photos.length) drop(s.photos)
      return s
    },
    /* 撤销：照片一个都不动 */
    rollback() {
      const s = snapshot
      snapshot = null
      return s
    },
  }
}

/* ------------------------------------------------------- 本地存储（Taro 同步接口）
   记录 / 店铺附加信息 / 照片索引三份数据，全部走 wx 的本地缓存。
   照片二进制走文件系统（见 photo.js），这里只存「记录用的是哪几个文件」。 */
export const FP_STORE_KEY = 'fp.records.v2'
export const FP_SHOP_STORE_KEY = 'fp.shops.v2'

/* 单条记录的最小形状：id / eat / rating / at 四项缺一不可。
   校验只认字段在不在，不判类型强弱：类型不对的条目在展示层自然降级，
   比在这儿猜「该转成什么」更安全。 */
function fpRecordOk(r) {
  return !!r && typeof r === 'object'
    && r.id !== undefined && r.id !== null
    && typeof r.eat === 'string'
    && typeof r.rating === 'number'
    && typeof r.at === 'string'
}

/* 内置示例数据不落盘：落了盘它就变成「存储里的旧快照」，示例数据升级后反而被自己挡住。
   用户一编辑出来的是新数组（!== FP_RECORDS），照常保存。 */
export function fpLoadRecords() {
  try {
    const raw = Taro.getStorageSync(FP_STORE_KEY)
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (Array.isArray(parsed) && parsed.length) {
        /* 逐条校验形状：字段缺一项就说明这份缓存不是本版本写的
           （字段改名、旧版本残留、手工改坏）。
           关键决策：**逐条过滤而不是整份丢弃** —— 用户 300 条里 3 条损坏，
           丢掉整份等于替他删了 297 条；过滤掉坏的，剩下的照常用。 */
        const clean = parsed.filter(fpRecordOk)
        /* 全部条目都读不懂才退回 null（用内置示例）：那是真·旧格式。
           部分损坏则用干净的那部分，并在控制台留下痕迹。 */
        if (clean.length) {
          /* eslint-disable-next-line no-console */
          if (clean.length !== parsed.length) {
            console.warn('[fp] 忽略 ' + (parsed.length - clean.length) + ' 条损坏记录')
          }
          return clean
        }
      }
    }
  } catch (e) {
    /* 存储不可用就用内置数据，不假装存住了 */
  }
  return null
}

export function fpSaveRecords(records) {
  try {
    Taro.setStorageSync(FP_STORE_KEY, JSON.stringify(records))
    return true
  } catch (e) {
    return false
  }
}

export function fpLoadShopExtras() {
  try {
    const raw = Taro.getStorageSync(FP_SHOP_STORE_KEY)
    const m = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {}
  } catch (e) {
    return {}
  }
}

export function fpSaveShopExtras(map) {
  try {
    Taro.setStorageSync(FP_SHOP_STORE_KEY, JSON.stringify(map || {}))
    return true
  } catch (e) {
    return false
  }
}
