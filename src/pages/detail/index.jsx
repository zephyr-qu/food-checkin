/* 屏 2：详情。
   标题区在原生导航栏下面：菜名居左、日期签居右，同一行 —— 照片因此上移，
   首屏就能看见菜名和照片（原来是「日期签 / 照片 / 菜名 / 评分」四段，菜名被推到第二屏）。
   评分紧跟照片，店 / 位置 / 短评 / 操作随后，全部在滚动流内。 */
import React from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRecords, fpAppRootStyle } from '../../data/store'
import { fpWhen, fpShopKey, fpRemoveRecord, fpInsertRecord, fpUndoWindow } from '../../data/core'
import { fpReadPhotos, fpRemovePhotos } from '../../data/photo'
import { Stars, PhotoSlot, routeTo, usePhotoTick } from '../../components/bits'
import { Icon } from '../../components/icons'
import { FP_COLORS } from '../../styles/tokens'

/* 撤销条：从底部升起的窄条，只活 3 秒。
   刻意不用 toast —— toast 点不了，而这里要的是「能按的按钮」。 */
function UndoBar({ onUndo }) {
  return (
    <View className="fp-undobar">
      <Text className="fp-undobar-text">删掉了</Text>
      <View className="fp-undobar-btn" hoverClass="fp-hover" onClick={onUndo}>
        撤销
      </View>
    </View>
  )
}

export default function DetailPage() {
  const [records, setRecords] = useRecords()
  const [id, setId] = React.useState('')
  /* hero 的高度取决于有没有照片（空态收短），照片一进一出要立刻重算高度，
     所以这一页也订阅照片变更；订阅必须无条件调用，不能挪到下面的空记录分支之后。 */
  usePhotoTick()

  React.useEffect(() => {
    const params = Taro.getCurrentInstance().router.params || {}
    setId(params.id || '')
  }, [])

  const record = records.filter((r) => r.id === id)[0]

  /* 分享带 id：对方打开直达同一笔（记录不存在时该页的兜底 effect 会拉回时间轴）。
     调用必须直接写在页面源码里：Taro 靠 AST 扫描页面文件识别 useShareAppMessage
     才会注册分享方法，封装进 helper 会扫不到。
      用 TARO_ENV 而不是 typeof 守卫：H5 端整个 useShareAppMessage 都不存在，
     编译期常量能让 H5 包直接摇掉这段（typeof 守卫是运行时判断，代码还在包里）；
      而且 TARO_ENV 在两端都是确定的，不像 typeof 那样依赖导出形态。 */
  if (process.env.TARO_ENV === 'weapp') {
    /* eslint-disable-next-line react-hooks/rules-of-hooks -- 单端内调用顺序恒定 */
    Taro.useShareAppMessage(() => ({
      title: record ? record.eat + '｜' + (record.shop || '没有店') : 'X师傅美食记',
      path: '/pages/detail/index?id=' + encodeURIComponent(id),
    }))
  }

  /* 撤销窗口：删除先生效（界面立刻响应），3 秒内可撤销。
     两个关键约束：
     1. 照片文件必须等窗口过期再删 —— 提前删了，撤销回来是空槽。
     2. 窗口期内不能跳走（下面的兜底跳转要跳过 pending 状态），
        否则撤销条一出现页面就没了，等于没得撤销。
     这些 Hook 必须写在任何早退分支之前（rules-of-hooks）。 */
  const [pending, setPending] = React.useState(null)
  const undoRef = React.useRef(null)
  /* 窗口状态机放 core：两个出口（计时到点 / 组件卸载）都要清照片，
     收进一个对象后页面没有「忘了调」的机会 —— 这正是之前漏的地方。 */
  const winRef = React.useRef(null)
  if (!winRef.current) winRef.current = fpUndoWindow(fpRemovePhotos)

  /* 组件卸载时收尾没走完的窗口：记录已经真的删了（setRecords 已执行），
     照片必须一起清，否则索引没了、文件永远留在持久区。 */
  React.useEffect(() => () => {
    if (undoRef.current) {
      clearTimeout(undoRef.current)
      undoRef.current = null
    }
    /* commit 可重复调用：计时器已跑过就是空操作，没跑过就负责删照片 */
    winRef.current.commit()
  }, [])

  /* 分享/冷启动直达且记录已不在：id 就位后回时间轴，不留没有出口的死壳页。
     只依赖 id（就位时机即判断时机），避免 handleDelete 删记录后重复触发二次跳转。 */
  React.useEffect(() => {
    if (id && !record) routeTo.timeline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!record) {
    /* 记录被别处删掉了：退回时间轴，不留一个空壳页（返回与标题由原生导航栏承担）。
       但「刚被自己删掉、撤销窗口还没关」是另一回事 —— 那时候要留在这儿让用户点撤销。 */
    return (
      <View className="fp-app" style={fpAppRootStyle()}>
        <View className="fp-head" />
        <View className="fp-scroll">
          <View className="fp-empty">
            <Icon name="camera" size={26} />
            <View>{pending ? '已经删掉了。' : '这条记录找不到了。'}</View>
          </View>
        </View>
        {pending ? <UndoBar onUndo={handleUndo} /> : null}
      </View>
    )
  }

  /* 取照片的口径与 PhotoSlot 一致（只读自己的 rec-<id>），
     否则会出现「槽里其实有图、hero 却按空态收短」的错配。
     示例照在 store.js 装载时已写进各自的 rec-<id>，读取口径只剩这一条。 */
  const own = fpReadPhotos('rec-' + record.id)
  const heroHasPhoto = own !== null && own.length > 0

  function handleDelete() {
    /* 不再用 showModal 确认 —— 撤销窗口本身就是确认：
       弹窗挡一次手滑，但删错了没法救；撤销条不挡手，且真能救回来。 */
    const cut = fpRemoveRecord(records, record.id)
    if (cut.index < 0) return
    setRecords(cut.records)
    setPending(winRef.current.adopt(cut.removed, own, cut.index))
    undoRef.current = setTimeout(() => {
      /* 窗口过期：这才真的清照片，然后回时间轴 */
      winRef.current.commit()
      undoRef.current = null
      setPending(null)
      routeTo.timeline()
    }, 3000)
  }

  function handleUndo() {
    if (!pending) return
    if (undoRef.current) {
      clearTimeout(undoRef.current)
      undoRef.current = null
    }
    /* 插回原来的位置，不是追加到末尾 —— 时间轴是按时间排的，
       插错位置会让这一笔莫名跳到最前面或最后面。
       rollback 只清快照、不动照片：这才是「撤销」该有的语义。 */
    const snap = winRef.current.rollback()
    if (!snap) return
    setRecords((prev) => fpInsertRecord(prev, snap.record, snap.index))
    setPending(null)
  }

  return (
    <View className="fp-app" style={fpAppRootStyle()}>
      <View className="fp-head">
        {/* 返回由原生导航栏承担；头部只剩一行标题区：
            菜名在左（这一页的主角），日期签右对齐（它只标注「什么时候」，不该和菜名抢一行里的主位）。
            两行变一行后，照片往上顶了一截 —— 首屏就能看见菜。 */}
        <View className="fp-head-bar">
          <Text className="fp-title"><Text className="fp-title-in">{record.eat}</Text></Text>
          <Text className="fp-head-meta fp-datechip">{fpWhen(record.at)}</Text>
        </View>
      </View>

      <View className="fp-scroll fp-scroll-nodock">
        <View className="fp-detail fp-enter">
          <View className={'fp-hero' + (heroHasPhoto ? '' : ' fp-hero-empty')}>
            <PhotoSlot
              id={'rec-' + record.id}
              /* 空态点击是跳编辑页（下面的 onTap），不是当场选图 —— 文案要兑现动作 */
              emptyText="还没有照片"
              stack
              preview
              onTap={() => routeTo.compose(record.id)}
            />
          </View>

          <View className="fp-detail-rate">
            <Stars value={record.rating} />
            <Text className="fp-rate-num">{record.rating} / 5</Text>
          </View>

          <View className="fp-detail-meta">
            {record.shop ? (
              <Text
                className="fp-detail-shop"
                hoverClass="fp-hover"
                onClick={() => routeTo.shop(fpShopKey(record.shop, record.city))}
              >
                <Text className="fp-detail-shopname">{record.shop}</Text>
              </Text>
            ) : (
              <Text className="fp-detail-noshop">没有店</Text>
            )}
            {record.city ? (
              <Text className="fp-detail-cell">
                <Icon name="pin" size={13} />{' '}
                {record.district ? record.city + ' ' + record.district : record.city}
              </Text>
            ) : null}
          </View>

          {record.note ? (
            <View className="fp-note">{record.note}</View>
          ) : (
            <Text className="fp-hint">没有写短评。</Text>
          )}

          <View className="fp-detail-actions">
            <View
              className="fp-btn fp-btn-ghost"
              hoverClass="fp-hover"
              onClick={() => routeTo.compose(record.id)}
            >
              <Icon name="edit" size={16} />
              <Text>编辑</Text>
            </View>
            <View
              className="fp-btn fp-btn-ghost fp-btn-del"
              hoverClass="fp-hover"
              onClick={handleDelete}
            >
              <Icon name="trash" size={16} color={FP_COLORS.danger} />
              <Text>删除</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
