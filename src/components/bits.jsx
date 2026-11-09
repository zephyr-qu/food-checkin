/* 共用小零件：星级、月份签、记录行、宫格卡、底部导航。
   原型的 class 名原样保留，样式层只需把 [data-*] 驱动的状态改成 class 驱动。 */
import React from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { fpWhen, fpPad, fpShopKey } from '../data/core'
import {
  fpReadPhotos, FP_STACK_ROT, fpOnPhotos, FP_MAX_PHOTOS,
  fpDropPhotoAt, fpRemovePhotos, fpNotifyPhotos,
} from '../data/photo'
import { FP_INTRO_PHOTOS } from '../data/demo-records'
import { Icon } from './icons'
import { FP_COLORS } from '../styles/tokens'

/* 任何一处改了照片，所有槽一起重渲染。 */
export function usePhotoTick() {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => fpOnPhotos(() => setTick((t) => t + 1)), [])
  return tick
}

/* 四拍倾斜：原型用 nth-child(4n+…) 生成，WXSS 不支持带参数伪类，
   改由列表索引算好 --tilt 内联进元素（同一套歪里换方向，相邻两行永远不会同角度）。 */
const REC_TILT = ['-2.4deg', '1.6deg', '-1.1deg', '2.8deg']
function tileTilt(i) {
  /* 原型是 2n/3n/4n 三条按书写顺序叠放，后者压前者 —— 按同样顺序模拟 */
  const k = i + 1
  let t = -1.4
  if (k % 2 === 0) t = 2
  if (k % 3 === 0) t = -2.4
  if (k % 4 === 0) t = 1.2
  return t + 'deg'
}

/* 跨页面传参 + 视图状态。小程序里 app 层没有单例，路由参数量又有限，
   所以详情/店铺/录入这类「带 id 的页面」统一走 globalData。 */
export const routeTo = {
  detail(id) {
    Taro.navigateTo({ url: '/pages/detail/index?id=' + encodeURIComponent(id) })
  },
  shop(key) {
    Taro.navigateTo({ url: '/pages/shop/index?key=' + encodeURIComponent(key) })
  },
  /* key 是 fpGroupByCity 的分组键：城市名，没填城市的组是 '__none__'。 */
  cityDetail(key) {
    Taro.navigateTo({ url: '/pages/citydetail/index?key=' + encodeURIComponent(key) })
  },
  compose(editingId) {
    Taro.navigateTo({
      url: '/pages/compose/index' + (editingId ? '?id=' + encodeURIComponent(editingId) : ''),
    })
  },
  /* 两屏根页没有配原生 tabBar（app.json 不带 tabBar 时 switchTab 直接失败）。
     回根页统一用 reLaunch：清空整个页面栈 → 栈恒为 1 层 → 原生导航栏无返回箭头。
     不能用 redirectTo：它只替换栈顶，从 detail/compose（深度≥2）回时间轴会留下
     「旧时间轴 + 新时间轴」两层，新时间轴左上角会多出返回箭头。 */
  timeline() {
    Taro.reLaunch({ url: '/pages/timeline/index' })
  },
  city() {
    Taro.reLaunch({ url: '/pages/city/index' })
  },
}

/* ------------------------------------------------------------------ 星级
   评分读数：五枚 ★，用 class 表示点亮与否（原型是 data-on，WXSS 不支持属性选择器）。 */
export function Stars({ value }) {
  return (
    <View className="fp-stars" aria-label={'评分 ' + value + ' / 5'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Text key={n} className={'fp-star-glyph' + (n <= value ? ' fp-on' : '')}>
          ★
        </Text>
      ))}
    </View>
  )
}

/* ---------------------------------------------------------------- 月份签
   onToggle 存在时变成可点的折叠开关（店铺页用），否则是纯标题（时间轴/城市页用）。 */
export function MonthHeader({ group, count, open, onToggle }) {
  const label = group.year + ' 年 ' + group.month + ' 月'
  if (!onToggle) {
    return (
      <View className="fp-month">
        <Text className="fp-month-lab">{label}</Text>
        <View className="fp-month-rule" />
      </View>
    )
  }
  return (
    <View className="fp-month">
      <View
        className={'fp-month-toggle' + (open ? ' fp-open' : '')}
        role="button"
        aria-expanded={open ? 'true' : 'false'}
        hoverClass="fp-hover"
        onClick={onToggle}
      >
        <Text className="fp-month-lab">{label}</Text>
        <Text className="fp-month-count">{count} 笔</Text>
        {/* dataURL SVG 没有继承环境，currentColor 会退化成黑 —— 直接烘 --icon-faint（matcha 档）。
            旋转必须走内联（Icon 的 style 是最高优先级，CSS 类规则压不住它），随开合算角度。 */}
        <Icon
          name="chevron"
          size={11}
          color={FP_COLORS.iconFaint}
          style={{ transform: 'rotate(' + (open ? '180deg' : '90deg') + ')' }}
        />
      </View>
      <View className="fp-month-rule" />
    </View>
  )
}

/* ------------------------------------------------------------------ 店名
   店名本身是进店铺页的入口（点它不进详情）。没传 onOpenShop 的场景退回纯文本。 */
function ShopName({ record }) {
  if (!record.shop) return <Text className="fp-sub-shop fp-noshop">没有店</Text>
  return (
    <Text
      className="fp-sub-shop fp-sub-shoplink"
      hoverClass="fp-hover"
      onClick={(e) => {
        e.stopPropagation && e.stopPropagation()
        routeTo.shop(fpShopKey(record.shop, record.city))
      }}
    >
      {record.shop}
    </Text>
  )
}

/* ------------------------------------------------------------------ 照片槽
   空态按传入文案三态：undefined = 默认提示；null = 只出图形；字符串 = 用该字符串。 */
export function PhotoSlot({ id, emptyText, stack, style, className, onTap, preview }) {
  usePhotoTick()
  const [at, setAt] = React.useState(0)
  /* 拖拽跟手量（设计 px，0 = 未在拖）：只作用于顶卡，容器挂 fp-slot-drag 期间关过渡 */
  const [drag, setDrag] = React.useState(0)
  const own = fpReadPhotos(id)
  /* 照片全部由用户上传：只读自己存的，空态落占位图形。
     示例照由 store.js 在示例态装载时写进各自的 rec-<id>；原来的 __demo
     全局回退没有任何写入方，是条死分支（评审要求「兑现或删」，选了删）。 */
  const srcs = own !== null ? own : []

  const n = srcs.length
  const cur = n ? ((at % n) + n) % n : 0
  const canCycle = !!stack && n > 1
  /* 手势状态走 ref：逐帧更新不触发重渲染，也不依赖渲染闭包 */
  const touchRef = React.useRef(null)   // 本次手势 {x, y, dx, dy}，move 里持续刷新
  const swipeRef = React.useRef(false)  // 本手势已滑动翻栈 → 吞掉同一次触碰尾巴上的 click

  function pointOf(e) {
    return (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null
  }

  function handleStart(e) {
    const t = pointOf(e)
    if (!t || !canCycle) return
    touchRef.current = { x: t.clientX, y: t.clientY, dx: 0, dy: 0 }
    swipeRef.current = false
  }

  function handleMove(e) {
    const s = touchRef.current
    const t = pointOf(e)
    if (!s || !t) return
    s.dx = t.clientX - s.x
    s.dy = t.clientY - s.y
    /* 横向占优才跟手（6px 死区防抖）；竖着划整段让给页面滚动，不抢手势 */
    setDrag(Math.abs(s.dx) > Math.abs(s.dy) && Math.abs(s.dx) > 6 ? s.dx * 0.4 : 0)
  }

  function handleEnd(e) {
    const s = touchRef.current
    touchRef.current = null
    setDrag(0)
    if (!s || !canCycle) return
    /* 收手坐标取 changedTouches（快甩常没有最后一发 touchmove）；40px 阈值 + 横向占优才翻。
       左划 = 下一张，与原生大图预览同向。 */
    const t = pointOf(e)
    const dx = t ? t.clientX - s.x : s.dx
    const dy = t ? t.clientY - s.y : s.dy
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) {
      swipeRef.current = true
      setAt((a) => a + (dx < 0 ? 1 : -1))
    }
  }

  function activate() {
    /* 滑动翻栈后的那次 click 是同一手势的尾巴：吞掉，不然刚翻完立刻弹大图/再翻一页 */
    if (swipeRef.current) {
      swipeRef.current = false
      return
    }
    /* preview 场景点开原生大图预览（里面同样能左右滑看全部）；原地翻栈交给上面的手势。
       无 preview 的栈槽点击仍翻页 —— 键盘激活也走这条 click，路径不能删。 */
    if (preview && n) {
      Taro.previewImage({ current: srcs[cur], urls: srcs }).catch(() => {})
      return
    }
    if (canCycle) {
      setAt((a) => a + 1)
      return
    }
    if (onTap) onTap(srcs)
  }

  /* 多于一张才有「下一张」：单图/空态不挂手势，不抢事件 */
  const gesture = canCycle
    ? { onTouchStart: handleStart, onTouchMove: handleMove, onTouchEnd: handleEnd, onTouchCancel: handleEnd }
    : {}

  return (
    <View
      className={'fp-slot' + (stack ? ' fp-slot-stack' : '') + (drag ? ' fp-slot-drag' : '') + (className ? ' ' + className : '')}
      style={style}
      role="button"
      hoverClass="fp-hover"
      onClick={activate}
      {...gesture}
    >
      {srcs.map((src, i) => {
        if (!stack) {
          /* 非堆叠槽（列表缩略图 / 宫格）只取第一张：多张全渲染成重叠层，
             后面的会盖住前面的（都没有 z-index）→ 显示的其实是最后一张，
             而宫格卡读的是 srcs[0]。两处口径必须一致，都取第一张。 */
          if (i > 0) return null
          return <Image key={'s' + i} className="fp-slot-img" src={src} mode="aspectFill" lazyLoad />
        }
        /* order = 离顶距离：0 是顶上那张（内缩最多、最正），越大越靠底层、也越歪。 */
        const order = (i - cur + n) % n
        const pad = Math.max(0, 12 - order * 3)
        /* 顶卡跟手：位移与既有旋转叠写在同一个 transform；松手 setDrag(0)，
           归位/换位由 .fp-slot-stack image 的既有 .22s 过渡接管（reduce 下已整段关掉）。 */
        const shift = order === 0 && drag ? 'translateX(' + Taro.pxTransform(drag) + ') ' : ''
        return (
          <Image
            key={'s' + i}
            className={'fp-slot-img ' + (order === 0 ? 'fp-stack-top' : 'fp-stack-under')}
            src={src}
            mode="aspectFill"
            style={{
              /* 内联 style 不走 postcss：pxTransform 按平台换算（weapp rpx / h5 rem），公式与样式层同源 */
              '--stack-pad': Taro.pxTransform(pad),
              transform: shift + 'rotate(' + FP_STACK_ROT[order % FP_STACK_ROT.length] + ')',
              zIndex: 10 - order,
            }}
          />
        )
      })}
      {!n ? (
        <View className="fp-slot-empty">
          <View className="fp-slot-glyph">
            <Icon name="camera" size={20} color={FP_COLORS.iconFaint} />
          </View>
          {emptyText === undefined ? <Text className="fp-slot-hint">点击选一张照片</Text> : null}
          {typeof emptyText === 'string' && emptyText ? (
            <Text className="fp-slot-hint">{emptyText}</Text>
          ) : null}
        </View>
      ) : null}
      {stack && n > 1 ? <Text className="fp-slot-count">{cur + 1}/{n}</Text> : null}
    </View>
  )
}

/* ------------------------------------------------------------------ 照片管理条
   一行缩略图 + 每张右上角一个删除点 + 末尾一个「加」格。
   为什么要有这一条：PhotoSlot 是叠图，只能看到最上面那张，
   想删第 3 张却没地方点 —— 这是「最多 5 张」变成「只能换不能删」的根因。
   删除先只摘索引（可撤销），文件等离开本页时才清（见 compose 的清理 effect）。 */
export function PhotoStrip({ id, onPick }) {
  usePhotoTick()
  const list = fpReadPhotos(id) || []
  const room = Math.max(0, FP_MAX_PHOTOS - list.length)

  function drop(i) {
    /* 摘索引 + 立刻删文件：这里不设撤销窗口 ——
       用户是逐张看着缩略图点的，误删能靠重新选图补回来（原图还在相册里）。 */
    const removed = list[i]
    fpDropPhotoAt(id, i)
    if (removed && removed.indexOf('http') !== 0) fpRemovePhotos([removed])
    fpNotifyPhotos()
  }

  /* 一张都没有就不占位置（空态已经由上面的 PhotoSlot 表达了） */
  if (!list.length) return null

  return (
    <View className="fp-pstrip">
      {list.map((src, i) => (
        <View key={'ph' + i} className="fp-pstrip-cell">
          <Image className="fp-pstrip-img" src={src} mode="aspectFill" lazyLoad />
          <View
            className="fp-pstrip-del"
            hoverClass="fp-hover"
            onClick={() => drop(i)}
          >
            <Text>✕</Text>
          </View>
        </View>
      ))}
      {room > 0 ? (
        <View className="fp-pstrip-cell fp-pstrip-add" hoverClass="fp-hover" onClick={onPick}>
          <Icon name="plus" size={16} color={FP_COLORS.iconFaint} />
        </View>
      ) : (
        <View className="fp-pstrip-cell fp-pstrip-full">
          <Text>{FP_MAX_PHOTOS} 张满</Text>
        </View>
      )}
    </View>
  )
}

/* ------------------------------------------------------------------ 记录行
   v2 只有一套行结构：缩略图 + 日期元件 + 星评。
   tape 只有首页首行传 —— 胶带是手账方向的痕迹，抹茶贴纸里保留为「最新一笔」的强调。 */
export function RowSticker({ record, tape, index = 0, hideShop, hideCity }) {
  const d = new Date(record.at)
  /* hideShop（店铺页用）：店名和城市在店头卡已经写死，行里再重复一遍是噪音，
     而且行内店名链接会 navigateTo 回同一家店 —— 页面栈里叠出一层一模一样的页。
     店铺页行内只保留区县（它是这家店之下的第二层信息，且没有重复）。
     hideCity（城市详情页用）：城市在名片卡标题里已经写死，行里同样只留区县；
     店名保留 —— 行内链去店铺页正是这一页的下钻出口。 */
  const locText = hideShop || hideCity
    ? record.district || ''
    : record.city
      ? record.district
        ? record.city + ' ' + record.district
        : record.city
      : ''
  /* 两个子元素都可能没有；都没有时整行 sub 不占位，不留空行高 */
  const showShop = !hideShop
  const showLoc = !!locText
  return (
    <View
      className="fp-rec"
      role="button"
      style={{ '--tilt': REC_TILT[index % 4] }}
      hoverClass="fp-hover"
      onClick={() => routeTo.detail(record.id)}
    >
      {tape ? <View className="fp-tape" /> : null}
      <View className="fp-thumb">
        {/* 只读槽：点这行是进详情，不是选照片 —— 文案必须兑现动作，所以只留图形 */}
        <PhotoSlot id={'rec-' + record.id} emptyText={null} />
      </View>
      <View className="fp-rec-body">
        <Text className="fp-eat">{record.eat}</Text>
        {showShop || showLoc ? (
          <View className="fp-sub">
            {showShop ? <ShopName record={record} /> : null}
            {showLoc ? (
              <View className="fp-sub-loc">
                <View className="fp-sub-dot" />
                <Text className="fp-sub-loctext">{locText}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View className="fp-whenrow">
          <Text className="fp-when">{fpWhen(record.at)}</Text>
          <Stars value={record.rating} />
        </View>
      </View>
      <Text className="fp-sticker" aria-hidden="true">
        {fpPad(d.getMonth() + 1)}.{fpPad(d.getDate())}
      </Text>
    </View>
  )
}

/* 宫格卡片：照片优先的浏览单元。缩略只读，没照片的记录用「日期贴 + 菜名」占位兜底。 */
export function GridTile({ record, index = 0 }) {
  usePhotoTick()
  const d = new Date(record.at)
  const own = fpReadPhotos('rec-' + record.id)
  const srcs = own !== null ? own : []
  const has = srcs.length > 0
  return (
    <View
      className="fp-tile"
      role="button"
      style={{ '--tilt': tileTilt(index) }}
      hoverClass="fp-hover"
      onClick={() => routeTo.detail(record.id)}
    >
      <View className={'fp-tile-media' + (has ? '' : ' fp-tile-empty')}>
        {has ? <Image className="fp-tile-img" src={srcs[0]} mode="aspectFill" lazyLoad /> : (
          /* 空态只留图形：菜名恒定在 footer（有图/无图两态骨架一致，星星不左右跳） */
          <View className="fp-tile-ph">
            <View className="fp-tile-glyph">
              <Icon name="camera" size={20} color={FP_COLORS.iconFaint} />
            </View>
          </View>
        )}
        <Text className="fp-sticker" aria-hidden="true">
          {fpPad(d.getMonth() + 1)}.{fpPad(d.getDate())}
        </Text>
      </View>
      <View className="fp-tile-foot">
        <Text className="fp-tile-eat">{record.eat}</Text>
        <Stars value={record.rating} />
      </View>
    </View>
  )
}

/* ---------------------------------------------------------------- 底部导航
   原型自带 tabbar。小程序原生 tabBar 会接管底部，但拿不到抹茶贴纸的中间加号样式，
   所以这里沿用自绘导航（app.json 里不配置 tabBar）。 */
export function FpTabBar({ active, dockCta }) {
  const [stamping, setStamping] = React.useState(false)
  /* 点当前页 = 不跳转：两个根页之间换台走 reLaunch（清栈才能让原生导航栏没有返回箭头），
     但 reLaunch 会连页面实例一起重建 —— 在「记录」页再点「记录」等于自废搜索词、
     月份折叠和滚动位置。原生 tabBar 点当前页是不响应的，这里对齐这个行为。 */
  const go = (key, jump) => {
    if (active === key) return
    jump()
  }
  return (
    <View className="fp-tabbar" aria-label="主导航">
      <View
        className={'fp-tab' + (active === 'timeline' ? ' fp-on' : '')}
        hoverClass="fp-hover"
        onClick={() => go('timeline', routeTo.timeline)}
      >
        <Icon name="clock" size={19} color={active === 'timeline' ? FP_COLORS.accentDeep : FP_COLORS.iconFaint} />
        <Text>记录</Text>
      </View>
      <View
        className={'fp-tab-add' + (stamping ? ' fp-stamping' : '')}
        aria-label={dockCta}
        hoverClass="fp-hover"
        onClick={() => {
          setStamping(true)
          setTimeout(() => {
            setStamping(false)
            routeTo.compose()
          }, 180)
        }}
      >
        <Icon name="plus" size={26} color={FP_COLORS.accentInk} />
      </View>
      <View
        className={'fp-tab' + (active === 'city' ? ' fp-on' : '')}
        hoverClass="fp-hover"
        onClick={() => go('city', routeTo.city)}
      >
        <Icon name="pin" size={19} color={active === 'city' ? FP_COLORS.accentDeep : FP_COLORS.iconFaint} />
        <Text>城市</Text>
      </View>
    </View>
  )
}

/* 空态：图形 + 一句话。
   variant="intro" 给第一次进来的用户：一摞散开的示例照 + 一句话，
   让「这儿该是什么样」先于「我该做什么」被看到 —— 图片路径清单
   移去了 data/demo-records.js（示例态样照种子与这里共用同一组静态图）。
   不参与数据流，纯展示；用户记了第一笔，首页就不再是空态，这组图自然退场。 */

export function Empty({ children, variant }) {
  if (variant === 'intro') {
    return (
      <View className="fp-empty fp-empty-intro">
        <View className="fp-intro-stack">
          {FP_INTRO_PHOTOS.map((src, i) => (
            <Image
              key={src}
              className="fp-intro-photo"
              src={src}
              mode="aspectFill"
              lazyLoad
              style={{
                transform: 'rotate(' + FP_STACK_ROT[i % FP_STACK_ROT.length] + ')',
                zIndex: 10 - i,
              }}
            />
          ))}
        </View>
        <View className="fp-empty-intro-text">{children}</View>
      </View>
    )
  }
  return (
    <View className="fp-empty">
      <Icon name="camera" size={26} color={FP_COLORS.iconFaint} />
      <View>{children}</View>
    </View>
  )
}
