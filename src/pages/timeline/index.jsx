/* 屏 1：时间轴（首页）。
   搜索、星级筛选只作用于列表本身，不动数据 —— 头上的统计仍算全部，
   否则筛一下数字就变，读起来像记录丢了。
   月份默认全展开；搜索/筛选激活时强制全展开（筛出来的记录藏在收起的月份里
   会读成「搜到却看不见」）。
   视图与月份折叠属于「浏览形态」，存模块级（reLaunch 重建实例后不丢）；
   搜索词 / 星级属于「查询条件」，留在组件里，切页即清 —— 两类状态政策分明。 */
import React from 'react'
import { View, Text, Input } from '@tarojs/components'
import { useRecords, FP_VARIANT, fpAppRootStyle } from '../../data/store'
import { fpGroupByMonth, fpStats, fpStatsText } from '../../data/core'
import { RowSticker, GridTile, MonthHeader, FpTabBar, Empty } from '../../components/bits'

/* 模块级视图状态：进详情时本页被卸载，放组件里返回会掉回列表。
   视图与月份折叠都算「浏览形态」（与查询条件相对：搜索词、星级只看本次会话）。 */
let tlView = 'list'
let tlClosed = {}

export default function TimelinePage() {
  const [records] = useRecords()
  const [q, setQ] = React.useState('')
  /* 聚焦态走 class 而不是 CSS :focus —— WXSS 不保证 :focus 生效，两端都用状态驱动 */
  const [searchFocus, setSearchFocus] = React.useState(false)
  const [minStar, setMinStar] = React.useState(0)
  const [view, setView] = React.useState(tlView)
  const [closed, setClosedState] = React.useState(tlClosed)

  /* 折叠态同步回模块级：详情往返后页面已重建，纯组件态会让月份全部弹回展开 */
  function setClosed(updater) {
    tlClosed = typeof updater === 'function' ? updater(tlClosed) : updater
    setClosedState(tlClosed)
  }

  const filtering = !!q.trim() || !!minStar
  const needle = q.trim()
  const shown = records.filter((r) => {
    if (minStar && r.rating < minStar) return false
    if (!needle) return true
    return [r.eat, r.shop, r.city, r.district, r.note].some((s) => s && s.indexOf(needle) >= 0)
  })

  const stats = fpStats(records)
  const groups = fpGroupByMonth(shown)
  const metaText = fpStatsText(FP_VARIANT.statsLabel, stats)

  function switchView(v) {
    tlView = v
    setView(v)
  }

  return (
    <View className="fp-app fp-tabbar-page" style={fpAppRootStyle()}>
      <View className="fp-head">
        <View className="fp-head-bar">
          {/* 溢出只交给内层 fp-title-in（与详情页同一口径）：.fp-title 保持
              overflow:visible，悬在标题框外的抹茶胶带（::before top:-10px）才不会被裁。 */}
          <Text className="fp-title"><Text className="fp-title-in">{FP_VARIANT.title}</Text></Text>
          <Text className="fp-head-meta">{metaText}</Text>
        </View>
        <View className="fp-searchrow">
          <View className={'fp-search' + (searchFocus ? ' fp-focus' : '')}>
            <Input
              className="fp-search-input"
              aria-label="搜索记录"
              value={q}
              placeholder="搜菜名、店、城市"
              placeholderClass="fp-search-ph"
              confirmType="search"
              onInput={(e) => setQ(e.detail.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
            />
            {needle ? (
              <View className="fp-search-clear" hoverClass="fp-hover" onClick={() => setQ('')}>
                <Text>✕</Text>
              </View>
            ) : null}
          </View>
          {/* 视图切换收在搜索行尾，星级筛选独占下一行（收成一颗 seg，不再散成四颗 chips）。 */}
          <View className="fp-seg fp-viewseg">
            <View
              className={'fp-seg-btn' + (view === 'list' ? ' fp-on' : '')}
              hoverClass="fp-hover"
              onClick={() => switchView('list')}
            >
              列表
            </View>
            <View
              className={'fp-seg-btn' + (view === 'grid' ? ' fp-on' : '')}
              hoverClass="fp-hover"
              onClick={() => switchView('grid')}
            >
              宫格
            </View>
          </View>
        </View>
        <View className="fp-filterrow">
          <View className="fp-sug">
            {[0, 3, 4, 5].map((n) => (
              <View
                key={n}
                className={'fp-chip' + (minStar === n ? ' fp-on' : '')}
                hoverClass="fp-hover"
                onClick={() => setMinStar(n)}
              >
                {n === 0 ? '全部' : n + ' 星以上'}
              </View>
            ))}
          </View>
        </View>
      </View>

      <View className="fp-scroll fp-enter">
        {records.length === 0 ? (
          <Empty variant="intro">你的美食手账，还没有第一笔。</Empty>
        ) : null}
        {records.length > 0 && shown.length === 0 ? (
          <Empty>
            没有匹配的记录{needle ? '：「' + needle + '」' : ''}。
            <Text
              className="fp-empty-reset"
              hoverClass="fp-hover"
              onClick={() => {
                setQ('')
                setMinStar(0)
              }}
            >
              清除筛选
            </Text>
          </Empty>
        ) : null}

        {groups.map((g) => {
          const open = filtering || !closed[g.key]
          return (
            <View key={g.key}>
              <MonthHeader
                group={g}
                count={g.items.length}
                open={open}
                onToggle={() => setClosed((m) => Object.assign({}, m, { [g.key]: !closed[g.key] }))}
              />
              {open && view === 'list' ? (
                <View className="fp-list">
                  {g.items.map((r, i) => (
                    <RowSticker key={r.id} record={r} tape={i === 0} index={i} />
                  ))}
                </View>
              ) : null}
              {open && view === 'grid' ? (
                <View className="fp-grid">
                  {g.items.map((r, i) => (
                    <GridTile key={r.id} record={r} index={i} />
                  ))}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>

      <FpTabBar active="timeline" dockCta={FP_VARIANT.dockCta} />
    </View>
  )
}
