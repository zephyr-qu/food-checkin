/* 屏 2.5：店铺（二级页，从详情/行内店名点进来）。
   店是派生的（记录按「名字@城市」聚起来），这一页只额外存地址。
   记录删光了店就不存在，直接提示并可返回，不留空壳页。
   月份折叠：进店默认只展开最新一个月。 */
import React from 'react'
import { View, Text, Input, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRecords, fpAppRootStyle } from '../../data/store'
import {
  fpBuildShops, fpGroupByMonth, fpLoadShopExtras, fpSaveShopExtras, fpPad,
} from '../../data/core'
import { RowSticker, MonthHeader } from '../../components/bits'
import { FP_COLORS } from '../../styles/tokens'
import {
  fpReadPhotos, fpPickPhotos, fpWritePhotos, fpNotifyPhotos, fpRemovePhotos, fpShopPhotoKey,
} from '../../data/photo'
import { Icon } from '../../components/icons'

/* 店面照：没图时只是店头卡右上角一颗小圆钮，选了图才铺成满宽横幅。 */
function ShopPhoto({ shopKey, name }) {
  const [tick, refresh] = React.useState(0)
  /* tick 是有意的重算扳机（选完照片手动 refresh 强制重读存储），
     它不被回调读取、但必须进依赖，去掉新选的照片就不刷新。 */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const own = React.useMemo(() => fpReadPhotos(fpShopPhotoKey(shopKey)), [shopKey, tick])

  function onPick() {
    const prev = own || []
    fpPickPhotos({ stack: false }).then((saved) => {
      if (!saved.length) return
      fpWritePhotos(fpShopPhotoKey(shopKey), saved)
      fpNotifyPhotos()
      /* 被换掉的旧图从持久区清掉，否则每换一次就多留一个孤儿文件 */
      fpRemovePhotos(prev)
      refresh((t) => t + 1)
    })
  }

  if (!own || !own.length) {
    return (
      <View
        className="fp-shop-photoicon fp-enter-1"
        hoverClass="fp-hover"
        onClick={onPick}
        title={'给「' + name + '」放一张店面照'}
      >
        <Icon name="camera" size={17} color={FP_COLORS.iconFaint} />
      </View>
    )
  }
  return (
    <View className="fp-shop-photo fp-enter-1">
      <Image className="fp-shop-photo-img" src={own[0]} mode="aspectFill" />
      <View
        className="fp-shop-photoicon fp-shop-photoicon-on"
        hoverClass="fp-hover"
        onClick={onPick}
      >
        <Icon name="camera" size={17} color={FP_COLORS.badgeInk} />
      </View>
    </View>
  )
}

export default function ShopPage() {
  const [records] = useRecords()
  const [shopKey, setShopKey] = React.useState('')
  const [addr, setAddr] = React.useState('')
  const [addrOpen, setAddrOpen] = React.useState(false)
  const [closed, setClosed] = React.useState({})

  React.useEffect(() => {
    const params = Taro.getCurrentInstance().router.params || {}
    const key = params.key ? decodeURIComponent(params.key) : ''
    setShopKey(key)
    const extras = fpLoadShopExtras()
    const e = extras[key]
    setAddr(e && e.addr ? e.addr : '')
  }, [])

  function commitAddr(value) {
    const v = value.trim()
    setAddr(v)
    const extras = fpLoadShopExtras()
    extras[shopKey] = Object.assign({}, extras[shopKey], { addr: v })
    fpSaveShopExtras(extras)
    setAddrOpen(false)
  }

  const shops = fpBuildShops(records)
  const shop = shops.filter((s) => s.key === shopKey)[0]

  /* 分享带 key：对方打开直达同一家店（店被删光时该页提示并可返回）。
     调用必须直接写在页面源码里：Taro 靠 AST 扫描页面文件识别 useShareAppMessage
     才会注册分享方法，封装进 helper 会扫不到。
      用 TARO_ENV 而不是 typeof 守卫：H5 端没有这个 hook，
      编译期常量能让 H5 包直接摇掉这段，也避免依赖导出形态。 */
  if (process.env.TARO_ENV === 'weapp') {
    /* eslint-disable-next-line react-hooks/rules-of-hooks -- 单端内调用顺序恒定 */
    Taro.useShareAppMessage(() => ({
      title: (shop ? shop.name : '一家小店') + '｜去过的店',
      path: '/pages/shop/index?key=' + encodeURIComponent(shopKey),
    }))
  }

  function copyAddr() {
    /* 有地址就走原生剪贴板（成功有系统 toast）；没地址就进入补录输入框。 */
    if (!addr) {
      setAddrOpen(true)
      return
    }
    Taro.setClipboardData({ data: addr }).catch(() => {})
  }

  if (!shop) {
    return (
      <View className="fp-app" style={fpAppRootStyle()}>
        {/* 返回与标题（店铺）由原生导航栏承担，页内头部只作留白。 */}
        <View className="fp-head" />
        <View className="fp-scroll fp-scroll-nodock">
          <View className="fp-empty">
            <Icon name="camera" size={26} />
            <View>这家店没有记录了。</View>
          </View>
        </View>
      </View>
    )
  }

  const groups = fpGroupByMonth(shop.items)
  /* 「最近一次」拆两行：大字放日子，时间退进标签行。 */
  const lastD = new Date(shop.lastAt)
  const lastDay =
    lastD.toDateString() === new Date().toDateString()
      ? '今天'
      : fpPad(lastD.getMonth() + 1) + '.' + fpPad(lastD.getDate())
  const lastTime = fpPad(lastD.getHours()) + ':' + fpPad(lastD.getMinutes())

  return (
    <View className="fp-app" style={fpAppRootStyle()}>
      <View className="fp-head">
        <View className="fp-head-bar">
          {/* 头部与城市页同构：贴纸标题放店名、相邻 meta 签放城市 —— 长店名的截断
              交给内层 .fp-title-in，标题自身绝不能 overflow（胶带 ::before 挂在外面）。 */}
          <Text className="fp-title"><Text className="fp-title-in">{shop.name}</Text></Text>
          {shop.city ? (
            <Text className="fp-head-meta">
              {/* 店按「名字@城市」聚合，同城同名店可能开在不同区：
                  记录里区县不一致就不写区县，免得读成唯一的店址。 */}
              {(() => {
                const ds = {}
                shop.items.forEach((r) => { if (r.district) ds[r.district] = 1 })
                const list = Object.keys(ds)
                return list.length === 1 ? shop.city + ' ' + list[0] : shop.city
              })()}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="fp-scroll fp-scroll-nodock">
        <View className="fp-shophead fp-enter">
          <ShopPhoto shopKey={shopKey} name={shop.name} />
          {/* 次数 / 均分 / 最近都从记录实时算 —— 店铺页存在的意义就是这三个数字。 */}
          <View className="fp-shop-stats fp-enter-2">
            <View className="fp-shop-stat">
              <Text className="fp-shop-statnum">{shop.visits}</Text>
              <Text className="fp-shop-statlab">去过（次）</Text>
            </View>
            <View className="fp-shop-stat">
              <Text className="fp-shop-statnum">{shop.avg.toFixed(1)}</Text>
              <Text className="fp-shop-statlab">平均（星）</Text>
            </View>
            <View className="fp-shop-stat">
              <Text className="fp-shop-statnum">{lastDay}</Text>
              <Text className="fp-shop-statlab">最近 {lastTime}</Text>
            </View>
          </View>
          <View className="fp-shop-addr fp-enter-3">
            {addrOpen ? (
              <Input
                className="fp-input fp-input-sm"
                value={addr}
                placeholder="记个地址，比如玉林中路 27 号"
                placeholderClass="fp-input-ph"
                /* -1 = 不限长：weapp Input 默认 140 会静默截断，H5 端却无限制，
                   两端行为对不齐 —— 显式放开后录入什么存什么。
                   小写 maxlength 是 weapp 模板真正认的键（maxLength 驼峰不映射）。 */
                maxLength={-1}
                /* eslint-disable-next-line react/jsx-no-duplicate-props -- 驼峰+小写双写是 weapp Input 模板要求 */
                maxlength={-1}
                focus
                onBlur={(e) => commitAddr(e.detail.value)}
                onConfirm={(e) => commitAddr(e.detail.value)}
              />
            ) : (
              <View className="fp-shop-addrrow">
                <View
                  className={'fp-shop-addrbtn' + (addr ? ' fp-has' : '')}
                  hoverClass="fp-hover"
                  onClick={copyAddr}
                >
                  {addr ? addr : '没记地址 · 点一下补一个'}
                </View>
                {/* 有地址时点击 = 复制（原行为），改错别字走这颗「改」——
                    否则地址一旦存过就永远改不了。 */}
                {addr ? (
                  <View
                    className="fp-shop-addredit"
                    hoverClass="fp-hover"
                    onClick={() => setAddrOpen(true)}
                  >
                    改
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </View>

        {groups.map((g, gi) => {
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
                    /* hideShop：店名/城市在店头卡已有，行内只留区县（见 RowSticker 注释） */
                    <RowSticker key={r.id} record={r} index={i} hideShop />
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
