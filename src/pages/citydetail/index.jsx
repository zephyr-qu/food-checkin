/* 屏 2.6：城市详情（二级页，从「美食足迹」页的图钉 / 城市排行 / 没测坐标行点进来）。
   城市是派生的（记录按城市聚起来），这一页不新增任何存储；页头与店铺页同构：
   fp-head-bar 里贴纸标题（城市）+ 相邻省份·名次签，卡片三格统计（吃了几笔 /
   几家店 / 最近）→ 按月折叠的记录列表。
   行内店名仍可进店铺页 —— 详情栈里城 → 店 → 笔是三级下钻，返回各自保留现场；
   行内位置只留区县（城市在页头标题里已写死，重复是噪音）。
   没填城市的组（key='__none__'）也走这一页：标题兜底成「没填城市」。 */
import React from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRecords, fpAppRootStyle } from '../../data/store'
import {
  fpGroupByCity, fpGroupByMonth, fpProvOfCity, provShort, fpPad,
} from '../../data/core'
import { RowSticker, MonthHeader } from '../../components/bits'
import { Icon } from '../../components/icons'

/* 店数口径与原城市面板一致：按店名去重（同城同名店在同城内即同一实体）。 */
function countShops(items) {
  const seen = {}
  let n = 0
  items.forEach((r) => {
    if (r.shop && !seen[r.shop]) { seen[r.shop] = true; n += 1 }
  })
  return n
}

export default function CityDetailPage() {
  const [records] = useRecords()
  const [cityKey, setCityKey] = React.useState('')
  /* 月份折叠：进城默认只展开最新一个月（与店铺页同节奏） */
  const [closed, setClosed] = React.useState({})

  React.useEffect(() => {
    const params = Taro.getCurrentInstance().router.params || {}
    setCityKey(params.key ? decodeURIComponent(params.key) : '')
  }, [])

  const groups = fpGroupByCity(records)
  const group = groups.filter((g) => g.key === cityKey)[0] || null
  const title = group && group.city ? group.city : '没填城市'
  const prov = group && group.city ? fpProvOfCity(group.city) : null

  /* 榜单名次：与城市页「城市排行」同一份降序（fpGroupByCity），没填城市的组不参与。
     只作头部签用 —— 总城数 <2 时不榜（与城市页「不排行」同口径）；
     头签 = 省份 · 第 N / 总城数，哪头没有就省掉哪头，都不填就不挂签。 */
  const cities = groups.filter((g) => g.key !== '__none__')
  const rankAt = cities.map((g) => g.key).indexOf(cityKey) + 1
  const chipParts = []
  if (prov) chipParts.push(provShort(prov))
  if (rankAt > 0 && cities.length >= 2) chipParts.push('第 ' + rankAt + ' / ' + cities.length)
  const headChip = chipParts.join(' ')

  /* 分享带 key：对方打开直达这座城市（记录删光时该页提示并可返回）。
      调用必须直接写在页面源码里：Taro 靠 AST 扫描页面文件识别 useShareAppMessage
      才会注册分享方法，封装进 helper 会扫不到。
      用 TARO_ENV 而不是 typeof 守卫：H5 端没有这个 hook，
      编译期常量能让 H5 包直接摇掉这段，也避免依赖导出形态。 */
  if (process.env.TARO_ENV === 'weapp') {
    /* eslint-disable-next-line react-hooks/rules-of-hooks -- 单端内调用顺序恒定 */
    Taro.useShareAppMessage(() => ({
      title: (group ? title : '一座城') + '｜美食足迹',
      path: '/pages/citydetail/index?key=' + encodeURIComponent(cityKey),
    }))
  }

  if (!group) {
    return (
      <View className="fp-app" style={fpAppRootStyle()}>
        {/* 返回与标题（城市）由原生导航栏承担，页内头部只作留白。 */}
        <View className="fp-head" />
        <View className="fp-scroll fp-scroll-nodock">
          <View className="fp-empty">
            <Icon name="pin" size={26} />
            <View>这座城没有记录了。</View>
          </View>
        </View>
      </View>
    )
  }

  /* 「最近一次」只放大日子（大字放日子是店铺页三格的排版口径）。 */
  const lastD = new Date(group.latest)
  const lastDay =
    lastD.toDateString() === new Date().toDateString()
      ? '今天'
      : fpPad(lastD.getMonth() + 1) + '.' + fpPad(lastD.getDate())
  const monthGroups = fpGroupByMonth(group.items)

  return (
    <View className="fp-app" style={fpAppRootStyle()}>
      <View className="fp-head">
        <View className="fp-head-bar">
          {/* 头部与城市页 / 店铺页同构：贴纸标题放城市、相邻 meta 签放省份·名次 ——
              胶带 ::before 挂在标题框外（top:-10px），标题自身绝不加 overflow，
              长城市名的截断交给内层 .fp-title-in。 */}
          <Text className="fp-title"><Text className="fp-title-in">{title}</Text></Text>
          {headChip ? <Text className="fp-head-meta">{headChip}</Text> : null}
        </View>
      </View>

      <View className="fp-scroll fp-scroll-nodock">
        {/* 名片卡只剩三格统计：身份（贴纸标题 + 省份·榜单签）已上移进页头。 */}
        <View className="fp-shophead fp-enter">
          <View className="fp-shop-stats fp-enter-1">
            <View className="fp-shop-stat">
              <Text className="fp-shop-statnum">{group.count}</Text>
              <Text className="fp-shop-statlab">吃了（笔）</Text>
            </View>
            <View className="fp-shop-stat">
              <Text className="fp-shop-statnum">{countShops(group.items)}</Text>
              <Text className="fp-shop-statlab">店（家）</Text>
            </View>
            <View className="fp-shop-stat">
              <Text className="fp-shop-statnum">{lastDay}</Text>
              <Text className="fp-shop-statlab">最近</Text>
            </View>
          </View>
        </View>

        {monthGroups.map((g, gi) => {
          /* groups 本来就按时间降序：index 0 = 最新月，默认展开它 */
          const open = closed[g.key] === undefined ? gi === 0 : !closed[g.key]
          return (
            <View key={g.key}>
              <MonthHeader
                group={g}
                count={g.items.length}
                open={open}
                onToggle={() => setClosed((m) => Object.assign({}, m, { [g.key]: open }))}
              />
              {open ? (
                <View className="fp-list">
                  {g.items.map((r, i) => (
                    /* hideCity：城市在页头标题里已写死，行里只留区县；
                       店名保留 —— 行内链去店铺页是这一页的下钻出口 */
                    <RowSticker key={r.id} record={r} index={i} hideCity />
                  ))}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}
