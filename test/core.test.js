/* core.js 的纯派生逻辑：格式化、分组、聚合、行政区划、投影、存储校验。
   这些函数一处写错，五屏的显示全歪 —— 也是最值得用测试锁住的部分。 */
import Taro from '@tarojs/taro'
import {
  fpPad, fpNowIso, fpWhen, fpGroupByMonth, fpGroupByCity, fpGroupByProvince,
  fpStats, fpBuildShops, fpShopCandidates, fpRecentCities, fpProvOfCity,
  fpAreaProvOfCity, fpAreaCities, fpAreaDistricts, fpDistrictCands, provShort,
  fpProjectLngLat, fpCityXY, fpLoadRecords, fpSaveRecords, FP_STORE_KEY,
  fpRemoveRecord, fpInsertRecord, fpUndoWindow,
} from '../src/data/core'
import { FP_RECORDS } from '../src/data/demo-records'

const rec = (over) => Object.assign({
  id: 'r' + Math.random(), eat: '菜', shop: null, city: null, district: null,
  rating: 4, at: '2026-01-01T12:00:00', note: null,
}, over)

beforeEach(() => {
  Taro.clearStorageSync()
})

describe('fpPad', () => {
  it('补零到两位', () => {
    expect(fpPad(3)).toBe('03')
    expect(fpPad(12)).toBe('12')
  })
})

describe('fpNowIso', () => {
  it('返回本地时区的 ISO 串，分钟精度', () => {
    const d = new Date()
    const expect_ = d.getFullYear() + '-' + fpPad(d.getMonth() + 1) + '-' + fpPad(d.getDate())
      + 'T' + fpPad(d.getHours()) + ':' + fpPad(d.getMinutes()) + ':00'
    expect(fpNowIso()).toBe(expect_)
  })

  it('能被 new Date 解析回来且不丢日期', () => {
    const back = new Date(fpNowIso())
    expect(back.getFullYear()).toBe(new Date().getFullYear())
    expect(back.getMonth()).toBe(new Date().getMonth())
    expect(back.getDate()).toBe(new Date().getDate())
  })
})

describe('fpWhen', () => {
  it('今天只写时分', () => {
    const now = new Date()
    const at = now.getFullYear() + '-' + fpPad(now.getMonth() + 1) + '-' + fpPad(now.getDate())
      + 'T09:05:00'
    expect(fpWhen(at)).toBe('今天 09:05')
  })

  it('其它日子写月日时分', () => {
    expect(fpWhen('2026-03-08T14:30:00')).toBe('03月08日 14:30')
  })
})

describe('fpGroupByMonth', () => {
  it('按年月倒序分组，组内也倒序', () => {
    const groups = fpGroupByMonth([
      rec({ id: 'a', at: '2026-01-05T10:00:00' }),
      rec({ id: 'b', at: '2026-03-05T10:00:00' }),
      rec({ id: 'c', at: '2026-03-20T10:00:00' }),
      rec({ id: 'd', at: '2026-01-25T10:00:00' }),
    ])
    expect(groups.map((g) => g.key)).toEqual(['2026-03', '2026-01'])
    expect(groups[0].items.map((r) => r.id)).toEqual(['c', 'b'])
    expect(groups[1].items.map((r) => r.id)).toEqual(['d', 'a'])
    expect(groups[0].month).toBe(3)
  })

  it('不改原数组', () => {
    const input = [rec({ at: '2026-01-05T10:00:00' }), rec({ at: '2026-03-05T10:00:00' })]
    fpGroupByMonth(input)
    expect(input[0].at).toBe('2026-01-05T10:00:00')
  })
})

describe('fpGroupByCity', () => {
  it('按城市聚合，笔数多的在前', () => {
    const groups = fpGroupByCity([
      rec({ id: 'a', city: '成都' }),
      rec({ id: 'b', city: '上海' }),
      rec({ id: 'c', city: '上海' }),
    ])
    expect(groups.map((g) => g.city)).toEqual(['上海', '成都'])
    expect(groups[0].count).toBe(2)
    expect(groups[0].latest).toBe('2026-01-01T12:00:00')
  })

  it('笔数相同按城市名排序', () => {
    const groups = fpGroupByCity([rec({ city: '上海' }), rec({ city: '北京' })])
    expect(groups.map((g) => g.city)).toEqual(['上海', '北京'])
  })

  it('没有城市的记录单独归到最后一组', () => {
    const groups = fpGroupByCity([
      rec({ city: null }), rec({ city: null }), rec({ city: '成都' }), rec({ city: '上海' }),
      rec({ city: '上海' }),
    ])
    expect(groups[groups.length - 1].key).toBe('__none__')
    expect(groups[groups.length - 1].count).toBe(2)
  })
})

describe('fpGroupByProvince', () => {
  it('城市分组 → 省级聚合，按笔数降序（省名用 china-map 的全名）', () => {
    const prov = fpGroupByProvince(fpGroupByCity([
      rec({ city: '成都' }), rec({ city: '乐山' }), rec({ city: '上海' }),
    ]))
    expect(prov[0].prov).toBe('四川省')
    expect(prov[0].count).toBe(2)
    expect(prov[0].cities.length).toBe(2)
  })

  it('查不到省的城市被跳过（不猜它属于哪个省）', () => {
    const prov = fpGroupByProvince(fpGroupByCity([rec({ city: '火星市' })]))
    expect(prov).toEqual([])
  })
})

describe('fpStats', () => {
  it('数记录 / 店 / 城', () => {
    const s = fpStats([
      rec({ shop: 'A', city: '成都' }), rec({ shop: 'A', city: '成都' }),
      rec({ shop: 'B', city: '上海' }), rec({ shop: null, city: null }),
    ])
    expect(s).toEqual({ count: 4, shops: 2, cities: 2 })
  })
})

describe('fpBuildShops', () => {
  it('按「名字@城市」聚合，算出去过几次与平均分', () => {
    const shops = fpBuildShops([
      rec({ shop: '大壶春', city: '上海', rating: 4, at: '2026-08-15T08:30:00' }),
      rec({ shop: '大壶春', city: '上海', rating: 5, at: '2026-09-14T08:40:00' }),
      rec({ shop: '大壶春', city: '北京', rating: 3, at: '2026-09-20T08:40:00' }),
    ])
    /* 排序按 lastAt 降序：北京那次的 09-20 比上海晚 → 排在最前 */
    expect(shops.length).toBe(2)
    expect(shops[0].key).toBe('大壶春@北京')
    expect(shops[0].visits).toBe(1)
    const sh = shops[1]
    expect(sh.name).toBe('大壶春')
    expect(sh.visits).toBe(2)
    expect(sh.avg).toBe(4.5)
    expect(sh.lastAt).toBe('2026-09-14T08:40:00')
    expect(sh.key).toBe('大壶春@上海')
  })

  it('同城同名是两家不同的店', () => {
    const shops = fpBuildShops([
      rec({ shop: '面馆', city: '成都' }), rec({ shop: '面馆', city: '上海' }),
    ])
    expect(shops.length).toBe(2)
  })

  it('没店的记录不产生店铺实体', () => {
    expect(fpBuildShops([rec({ shop: null })])).toEqual([])
  })
})

describe('fpShopCandidates', () => {
  it('真实记录里出现过的店，带城市/区县', () => {
    const c = fpShopCandidates([
      rec({ shop: '大壶春', city: '上海', district: '黄浦区' }),
      rec({ shop: '大壶春', city: '上海' }),
      rec({ shop: '叶婆婆', city: '乐山' }),
    ])
    expect(c[0]).toEqual({ name: '大壶春', city: '上海', district: '黄浦区' })
    expect(c.length).toBe(2)
  })

  it('没有记录时退回内置名单', () => {
    const c = fpShopCandidates([])
    expect(c.length).toBeGreaterThan(0)
    expect(c[0].city).toBeNull()
  })
})

describe('fpRecentCities', () => {
  it('按出现顺序取前 N 个，去空白', () => {
    expect(fpRecentCities([
      rec({ city: '成都' }), rec({ city: '上海' }), rec({ city: '成都' }),
      rec({ city: '  ' }), rec({ city: '北京' }),
    ], 2)).toEqual(['成都', '上海'])
  })
})

describe('行政区划查询', () => {
  /* 两套省名并存，这是数据的既有约定，不是 bug：
     areas.js 用短名（"四川" / "上海"）作键 —— 录入页的省列表直接展示它；
     china-map.js 的 FP_CITY_PROV 用全名（"四川省" / "上海市"）——
     地图底图的省份路径名是全名，点-面查询必须跟它一致。
     provShort() 是全名 → 短名的桥。测试按各自的约定断言。 */

  it('fpProvOfCity：china-map 的点-面查询（全名），没收录返回 null', () => {
    expect(fpProvOfCity('成都')).toBe('四川省')
    expect(fpProvOfCity('乐山')).toBe('四川省')
    expect(fpProvOfCity('不存在的城')).toBeNull()
    expect(fpProvOfCity(null)).toBeNull()
  })

  it('fpAreaProvOfCity：areas.js 查键（短名），直辖市的省与市同名', () => {
    /* areas.js 的直辖市约定：省键 = 市键 = 短名且不带「市」后缀
       （"上海" → { "上海": "黄浦区 …" }）。这与 china-map.js 的全名（"上海市"）
       是两套写法，provShort() 是全名 → 短名的桥，但不剥「市」字。
       运行时传进来的 city 来自用户录入，示例数据用的正是短名（'上海' / '北京'），
       所以查得到；带「市」后缀的写法查不到，返回 null 由调用方降级。 */
    expect(fpAreaProvOfCity('成都')).toBe('四川')
    expect(fpAreaProvOfCity('上海')).toBe('上海')
    expect(fpAreaProvOfCity('北京')).toBe('北京')
    expect(fpAreaProvOfCity('无名')).toBeNull()
  })

  it('直辖市的市列表就是它自己（一级一项）', () => {
    expect(fpAreaCities('上海')).toEqual(['上海'])
    expect(fpAreaDistricts('上海', '上海')).toContain('黄浦区')
  })

  it('fpAreaDistricts：空格分隔的区县串', () => {
    const ds = fpAreaDistricts('四川', '成都')
    expect(ds.length).toBeGreaterThan(5)
    expect(ds).toContain('锦江区')
    expect(ds).toContain('武侯区')
  })

  it('fpDistrictCands：记录里出现过的区县排在前面，再补全国表', () => {
    const out = fpDistrictCands([rec({ city: '成都', district: '武侯区' })], '成都')
    expect(out[0]).toBe('武侯区')
    expect(out).toContain('锦江区')
    expect(new Set(out).size).toBe(out.length)
  })
})

describe('provShort', () => {
  it('自治区 / 省 / 市 后缀短写', () => {
    expect(provShort('广西壮族自治区')).toBe('广西')
    expect(provShort('上海市')).toBe('上海')
    expect(provShort('四川省')).toBe('四川')
    expect(provShort('香港特别行政区')).toBe('香港')
    expect(provShort('新疆维吾尔自治区')).toBe('新疆')
  })
})

describe('地图投影', () => {
  it('fpProjectLngLat：左上角是原点，往东/往南单调递增', () => {
    const a = fpProjectLngLat(73, 54.5)
    expect(a.x).toBeCloseTo(0, 6)
    expect(a.y).toBeCloseTo(0, 6)
    const east = fpProjectLngLat(136, 54.5)
    expect(east.x).toBeGreaterThan(a.x)
    const south = fpProjectLngLat(73, 18)
    expect(south.y).toBeGreaterThan(a.y)
  })

  it('输出是 1000 宽画布坐标（LNG1=73+63cos35° 落在右边界）', () => {
    const far = fpProjectLngLat(136, 54.5)
    expect(far.x).toBeCloseTo(1000, 0)
  })

  it('纬度校正：经度方向乘 cos35°（中国居中纬度的收缩）', () => {
    /* LNG1-LNG0 = 63° 经度。乘 cos35° 后图上宽 ≈ 51.6 个单位，
       再按 SCALE 放大到 1000 —— 也就是说 63° 经度正好铺满 1000 宽。
       不乘 K 的话 63° 会占到 1220，地图右侧被裁掉。 */
    const far = fpProjectLngLat(136, 54.5)
    expect(far.x).toBeCloseTo(1000, 6)
    /* 反过来验：同一纬度下，经度差的一半，图上宽也是一半 */
    const mid = fpProjectLngLat(104.5, 54.5)
    expect(mid.x).toBeCloseTo(far.x / 2, 6)
  })

  it('纬度方向不乘 K（等距圆柱的南北比例）', () => {
    /* y 只按纬度差线性缩放：36.5° 纬度差 → 36.5 × SCALE。
       SCALE 由经度跨度定，所以南北看起来比真实比例略长 —— 这是等距圆柱投影的
       固有特征（也是中国地图的通行画法），锁住它防止有人「顺手修正」成另一种投影，
       那会让 china-map.js 的轮廓与图钉错位。 */
    const scale = 1000 / ((136 - 73) * Math.cos((35 * Math.PI) / 180))
    expect(fpProjectLngLat(73, 18).y).toBeCloseTo(36.5 * scale, 6)
  })

  it('fpCityXY：收录城市有坐标，未收录返回 null', () => {
    expect(fpCityXY('成都')).not.toBeNull()
    expect(fpCityXY('火星市')).toBeNull()
    expect(fpCityXY(null)).toBeNull()
  })
})

describe('areas.js 数据自洽（生成脚本缺失，靠测试兜底）', () => {
  /* areas.js 是 39KB 的行政区划数据（34 省 · 394 市 · 2946 区县），生成脚本不在仓库。
     手工编辑这份文件很容易改出「省键改了但没人跟着改」的静默错误 ——
     这些断言就是它的最低限度校验器。 */
  const { FP_AREAS } = require('../src/data/areas')

  it('34 省齐全，每省至少有 1 个市', () => {
    const provs = Object.keys(FP_AREAS)
    expect(provs.length).toBe(34)
    provs.forEach((p) => {
      const cities = Object.keys(FP_AREAS[p])
      expect(cities.length).toBeGreaterThan(0)
    })
  })

  it('每个非直辖市的市都有区县（空值只允许出现在合规的省直辖单位）', () => {
    /* 394 个市里有 56 个区县串为空，全部合规，分三类：
       1. 港澳：特别行政区本身没有下属区县
       2. 省直辖县级市 / 林区（新疆兵团 12 市、海南 12 个、湖北仙桃/天门/潜江/神农架）：
          它们本身就是县级单位，不设区县
       3. 台湾省：数据源未收录下属区县 —— 这是唯一真正的数据缺失，
          但台湾只作地图展示（FP_CITY_GEO 只收了台北/高雄的经纬度），
          录入页选不到台湾的市（FP_AREAS 里有键但区县为空），影响可控
       断言口径：空值必须落在「已知合规集合」里。新增的异常空值会立刻失败 ——
       这是手工编辑 39KB 数据文件时唯一的防护网。 */
    const LEGAL_EMPTY = {
      香港: ['香港'], 澳门: ['澳门'],
      新疆: ['五家渠市', '北屯市', '双河市', '可克达拉市', '图木舒克市', '新星市', '昆玉市',
        '白杨市', '石河子市', '胡杨河市', '铁门关市', '阿拉尔市'],
      海南: ['万宁市', '东方市', '临高县', '乐东黎族自治县', '五指山市', '保亭黎族苗族自治县',
        '定安县', '屯昌县', '文昌市', '昌江黎族自治县', '澄迈县', '琼中黎族苗族自治县',
        '琼海市', '白沙黎族自治县', '陵水黎族自治县'],
      湖北: ['仙桃市', '天门市', '潜江市', '神农架林区'],
      河南: ['济源市'],
    }
    const TW_OK = '台湾' /* 台湾省全区县缺失，见上方说明 */

    const bad = []
    Object.keys(FP_AREAS).forEach((p) => {
      Object.keys(FP_AREAS[p]).forEach((c) => {
        const ds = fpAreaDistricts(p, c)
        if (ds.length) return
        if (p === TW_OK) return
        const legal = LEGAL_EMPTY[p]
        if (!legal || legal.indexOf(c) < 0) bad.push(p + ' / ' + c)
      })
    })
    expect(bad).toEqual([])
  })

  it('非空的区县串里没有空串 / 连续空格', () => {
    const bad = []
    Object.keys(FP_AREAS).forEach((p) => {
      Object.keys(FP_AREAS[p]).forEach((c) => {
        const raw = String(FP_AREAS[p][c] || '')
        if (raw.indexOf('  ') >= 0) bad.push(p + '/' + c + ' 有连续空格')
        raw.split(' ').forEach((d) => {
          if (d && d !== d.trim()) bad.push(p + '/' + c + ' 的 "' + d + '" 带空白')
        })
      })
    })
    expect(bad).toEqual([])
  })

  it('省键与市键不重复冲突（同名只在直辖市合法）', () => {
    /* 直辖市的省键 === 市键（上海 → 上海）；除此之外不应出现跨省同名市
        —— 反查表 FP_CITY_TO_PROV 按首次出现赋值，同名市会让后者被静默吞掉。 */
    const seen = {}
    const dup = []
    Object.keys(FP_AREAS).forEach((p) => {
      Object.keys(FP_AREAS[p]).forEach((c) => {
        if (seen[c] && seen[c] !== p) dup.push(c + '：' + seen[c] + ' 与 ' + p)
        else seen[c] = p
      })
    })
    expect(dup).toEqual([])
  })

  it('直辖市：省键 === 市键，且区县就是它自己的区', () => {
    ;['上海', '北京', '天津', '重庆'].forEach((m) => {
      expect(Object.keys(FP_AREAS[m])).toContain(m)
      expect(fpAreaDistricts(m, m).length).toBeGreaterThan(10)
    })
  })
})

describe('记录存储校验', () => {
  it('写进去能原样读回来', () => {
    expect(fpSaveRecords([rec({ id: 'x' })])).toBe(true)
    const loaded = fpLoadRecords()
    expect(loaded.length).toBe(1)
    expect(loaded[0].id).toBe('x')
  })

  it('空数组不当成有效数据（退回内置示例）', () => {
    fpSaveRecords([])
    expect(fpLoadRecords()).toBeNull()
  })

  it('逐条过滤坏条目，不丢整份', () => {
    Taro.setStorageSync(FP_STORE_KEY, JSON.stringify([
      rec({ id: 'good1' }),
      { eat: '缺 id', rating: 4, at: '2026-01-01T12:00:00' },
      { id: 'no-rating', eat: '菜', at: '2026-01-01T12:00:00' },
      rec({ id: 'good2' }),
      null,
      '不是对象',
    ]))
    const loaded = fpLoadRecords()
    expect(loaded.map((r) => r.id)).toEqual(['good1', 'good2'])
  })

  it('全部条目都坏才退回 null', () => {
    Taro.setStorageSync(FP_STORE_KEY, JSON.stringify([{ eat: '没 id' }, null]))
    expect(fpLoadRecords()).toBeNull()
  })

  it('损坏的 JSON 不炸，返回 null', () => {
    Taro.setStorageSync(FP_STORE_KEY, '{不是合法JSON')
    expect(fpLoadRecords()).toBeNull()
  })

  it('内置示例数据本身全部合法', () => {
    /* 内置数据过不了自己的校验，空态引导就会永远出不来 */
    const ok = FP_RECORDS.every((r) => typeof r.id !== 'undefined'
      && typeof r.eat === 'string' && typeof r.rating === 'number' && typeof r.at === 'string')
    expect(ok).toBe(true)
  })
})

describe('删除 / 撤销（纯函数）', () => {
  const A = { id: 'a', eat: 'A' }
  const B = { id: 'b', eat: 'B' }
  const C = { id: 'c', eat: 'C' }
  const list = [A, B, C]

  it('摘掉指定 id，返回原位置', () => {
    const r = fpRemoveRecord(list, 'b')
    expect(r.records).toEqual([A, C])
    expect(r.index).toBe(1)
    expect(r.removed).toEqual(B)
  })

  it('id 不存在时原样返回，index 为 -1（调用方据此不发撤销条）', () => {
    const r = fpRemoveRecord(list, 'zzz')
    expect(r.records).toEqual(list)
    expect(r.index).toBe(-1)
    expect(r.removed).toBeNull()
  })

  it('不修改传入的数组（React state 必须不可变）', () => {
    const before = list.slice()
    fpRemoveRecord(list, 'a')
    expect(list).toEqual(before)
  })

  it('插回原位：撤销后顺序与删除前一模一样', () => {
    const cut = fpRemoveRecord(list, 'b')
    expect(fpInsertRecord(cut.records, cut.removed, cut.index)).toEqual([A, B, C])
  })

  it('撤销首尾两条也回到原位', () => {
    const first = fpRemoveRecord(list, 'a')
    expect(fpInsertRecord(first.records, first.removed, first.index)).toEqual([A, B, C])
    const last = fpRemoveRecord(list, 'c')
    expect(fpInsertRecord(last.records, last.removed, last.index)).toEqual([A, B, C])
  })

  it('index 越界时夹紧，不报错也不丢记录', () => {
    /* 窗口期内别处又删了两条，原来的 index 就大了 */
    expect(fpInsertRecord([], C, 5)).toEqual([C])
    expect(fpInsertRecord([A], C, 99)).toEqual([A, C])
    expect(fpInsertRecord([A], C, -3)).toEqual([C, A])
  })

  it('record 为空时原样返回（防呆）', () => {
    expect(fpInsertRecord(list, null, 0)).toEqual(list)
  })

  it('入参不是数组时降级，不炸', () => {
    expect(fpRemoveRecord(null, 'a').records).toEqual([])
    expect(fpInsertRecord(null, A, 0)).toEqual([A])
  })
})

describe('撤销窗口状态机 fpUndoWindow', () => {
  /* 这一节守的是一个真实事故：detail 页的卸载清理里，
     注释写着「照片照删」，代码却只 clearTimeout、从没调 fpRemovePhotos。
     结果是删了记录、索引没了、文件永远躺在持久区。
     任何单元测试都发现不了「忘记调用」，所以要把它变成「调不调都对」的结构：
     两个出口（计时到点 / 卸载）都走同一个 commit()。 */
  const mk = () => {
    const dropped = []
    const w = fpUndoWindow((paths) => dropped.push(paths))
    return { w, dropped }
  }
  const PHOTOS = ['/wxfile/store/a.jpg', '/wxfile/store/b.jpg']

  it('adopt 记下记录、照片、位置', () => {
    const { w } = mk()
    const one = { id: 'r1' }
    const snap = w.adopt(one, PHOTOS, 3)
    expect(snap).toEqual({ record: one, photos: PHOTOS, index: 3 })
    expect(w.current()).toEqual(snap)
  })

  it('commit 清照片（窗口过期的正常路径）', () => {
    const { w, dropped } = mk()
    w.adopt({ id: 'r1' }, PHOTOS, 0)
    w.commit()
    expect(dropped).toEqual([PHOTOS])
    expect(w.current()).toBeNull()
  })

  it('rollback 一张照片都不动（用户点了撤销）', () => {
    const { w, dropped } = mk()
    const doomed = { id: 'r1' }
    w.adopt(doomed, PHOTOS, 1)
    const snap = w.rollback()
    expect(dropped).toEqual([])
    expect(snap.record).toBe(doomed)
    expect(snap.index).toBe(1)
  })

  it('commit 可重复调用，照片只删一次（计时器与卸载都会触发）', () => {
    const { w, dropped } = mk()
    w.adopt({ id: 'r1' }, PHOTOS, 0)
    w.commit()
    w.commit()
    w.commit()
    expect(dropped).toEqual([PHOTOS])
  })

  it('先 commit 再 rollback：撤销拿不到东西，也不会误删', () => {
    const { w, dropped } = mk()
    w.adopt({ id: 'r1' }, PHOTOS, 0)
    w.commit()
    expect(w.rollback()).toBeNull()
    expect(dropped).toEqual([PHOTOS])
  })

  it('先 rollback 再 commit：照片不该被删（已经撤销了）', () => {
    const { w, dropped } = mk()
    w.adopt({ id: 'r1' }, PHOTOS, 0)
    w.rollback()
    w.commit()
    expect(dropped).toEqual([])
  })

  it('没有照片时 commit 不调删除（空数组也放过）', () => {
    const { w, dropped } = mk()
    w.adopt({ id: 'r1' }, [], 0)
    w.commit()
    expect(dropped).toEqual([])
  })

  it('photos 为 null 也不炸', () => {
    const { w, dropped } = mk()
    w.adopt({ id: 'r1' }, null, 0)
    expect(() => w.commit()).not.toThrow()
    expect(dropped).toEqual([])
  })

  it('没 adopt 就 commit：空操作', () => {
    const { w, dropped } = mk()
    expect(() => w.commit()).not.toThrow()
    expect(dropped).toEqual([])
  })

  it('不传删除函数也能跑（默认空实现）', () => {
    const w = fpUndoWindow()
    w.adopt({ id: 'r1' }, PHOTOS, 0)
    expect(() => w.commit()).not.toThrow()
  })

  it('两个窗口互不干扰（各自快照独立）', () => {
    const a = mk()
    const b = mk()
    a.w.adopt({ id: 'a' }, ['/a.jpg'], 0)
    b.w.adopt({ id: 'b' }, ['/b.jpg'], 0)
    a.w.rollback()
    b.w.commit()
    expect(a.dropped).toEqual([])
    expect(b.dropped).toEqual([['/b.jpg']])
  })
})

describe('状态栏高度实测', () => {
  /* 顶部留白原写死 62px，安卓机型（状态栏 24~40px、胶囊 32~40px）会偏或压标题。
     store 用 getMenuButtonBoundingClientRect 实测后内联到 .fp-app，
     量不到就落回 62px。 */
  const store = require('../src/data/store')

  /* fpMeasureStatusTop 有「只测一次」的缓存（避免每个页面都去量）——
     每个用例前 fpResetStatusTop() 清缓存，否则第二个用例会拿到第一个的结果。
     不 resetModules：那会让 store 拿到新的 Taro mock 实例，外层对 mock 的赋值全丢。 */
  beforeEach(() => {
    store.fpResetStatusTop()
  })

  it('量不到胶囊时落回 62px 默认值', () => {
    Taro.getMenuButtonBoundingClientRect = undefined
    expect(store.fpMeasureStatusTop()).toBe(62)
    expect(store.fpAppRootStyle()['--status-top']).toBe('62px')
  })

  it('胶囊返回异常值（null / 无 bottom）时保持默认', () => {
    Taro.getMenuButtonBoundingClientRect = () => null
    expect(store.fpMeasureStatusTop()).toBe(62)
    store.fpResetStatusTop()
    Taro.getMenuButtonBoundingClientRect = () => ({ width: 87 })
    expect(store.fpMeasureStatusTop()).toBe(62)
  })

  it('胶囊返回越界值时保持默认（防御性边界）', () => {
    /* bottom < 40：读数不可信（真机至少 40+），保持默认 */
    Taro.getMenuButtonBoundingClientRect = () => ({ bottom: 0 })
    expect(store.fpMeasureStatusTop()).toBe(62)
    store.fpResetStatusTop()
    Taro.getMenuButtonBoundingClientRect = () => ({ bottom: 8 })
    expect(store.fpMeasureStatusTop()).toBe(62)
    /* bottom > 200：折叠屏展开也就 120 左右，超了必是异常 */
    store.fpResetStatusTop()
    Taro.getMenuButtonBoundingClientRect = () => ({ bottom: 999 })
    expect(store.fpMeasureStatusTop()).toBe(62)
  })

  it('边界值本身可用：bottom 40 与 200 都算有效', () => {
    Taro.getMenuButtonBoundingClientRect = () => ({ bottom: 40 })
    expect(store.fpMeasureStatusTop()).toBe(48)
    store.fpResetStatusTop()
    Taro.getMenuButtonBoundingClientRect = () => ({ bottom: 200 })
    expect(store.fpMeasureStatusTop()).toBe(208)
  })

  it('正常机型：bottom + 8px 间距', () => {
    /* iPhone：胶囊 bottom 约 88 → 96px 顶部留白 */
    Taro.getMenuButtonBoundingClientRect = () => ({ bottom: 88 })
    expect(store.fpMeasureStatusTop()).toBe(96)
    /* 安卓矮状态栏：胶囊 bottom 约 64 → 72px */
    store.fpResetStatusTop()
    Taro.getMenuButtonBoundingClientRect = () => ({ bottom: 64 })
    expect(store.fpMeasureStatusTop()).toBe(72)
  })

  it('测到的值写进 inline style 供 .fp-head 消费', () => {
    Taro.getMenuButtonBoundingClientRect = () => ({ bottom: 88 })
    expect(store.fpAppRootStyle()).toEqual({ '--status-top': '96px' })
  })

  it('测一次就缓存，不每个页面都去量', () => {
    let calls = 0
    Taro.getMenuButtonBoundingClientRect = () => { calls += 1; return { bottom: 88 } }
    store.fpMeasureStatusTop()
    store.fpMeasureStatusTop()
    store.fpMeasureStatusTop()
    expect(calls).toBe(1)
  })

  it('fpResetStatusTop 之后能按新机型重测', () => {
    Taro.getMenuButtonBoundingClientRect = () => ({ bottom: 88 })
    expect(store.fpMeasureStatusTop()).toBe(96)
    store.fpResetStatusTop()
    Taro.getMenuButtonBoundingClientRect = () => ({ bottom: 64 })
    expect(store.fpMeasureStatusTop()).toBe(72)
  })
})
