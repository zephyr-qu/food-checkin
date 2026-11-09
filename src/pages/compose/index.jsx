/* 屏 3：录入 / 编辑。
   语音输入（Web Speech API）第一版移除，短评改为纯手打。
   位置选择是推进式列表：全国 34 省 → 该省的市 → 该市的区县，逐级下钻；
   「最近去过」快捷城市常驻位置字段下方一行，点击直接选中。
   选完城市自动收起，区县可留空。 */
import React from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRecords, FP_VARIANT, fpAppRootStyle } from '../../data/store'
import { FP_COLORS } from '../../styles/tokens'
import {
  fpShopCandidates, fpRecentCities, fpProvinces, fpAreaCities, fpAreaDistricts, fpNowIso,
} from '../../data/core'
import {
  fpPickPhotos, fpWritePhotos, fpReadPhotos, fpNotifyPhotos, fpPhotoRoom,
  fpRemovePhotos, FP_NEW_PHOTO_KEY, FP_MAX_PHOTOS,
} from '../../data/photo'
import { PhotoSlot, PhotoStrip, routeTo } from '../../components/bits'
import { Icon } from '../../components/icons'

/* 星级输入：五枚星，点第 n 枚就是 n 星。 */
function RatingInput({ value, onChange }) {
  return (
    <View className="fp-rate">
      {[1, 2, 3, 4, 5].map((n) => (
        <View key={n} className="fp-star" aria-label={n + ' 星'} hoverClass="fp-hover" onClick={() => onChange(n)}>
          <View className={'fp-rshape' + (n <= value ? ' fp-on' : '')} />
        </View>
      ))}
      <Text className="fp-rate-num">{value ? value + ' / 5' : '未评'}</Text>
    </View>
  )
}

export default function ComposePage() {
  const [records, setRecords] = useRecords()
  const [editing, setEditing] = React.useState(null)

  React.useEffect(() => {
    const params = Taro.getCurrentInstance().router.params || {}
    let isEdit = false
    if (params.id) {
      const id = decodeURIComponent(params.id)
      const found = records.filter((r) => r.id === id)[0]
      if (found) {
        isEdit = true
        setEditing(found)
        /* 字段初值是从 base（首次渲染的 {}）取的，editing 晚一拍就位，
           必须在这里把各字段回填，否则编辑页永远是空表单。 */
        setEat(found.eat || '')
        setShop(found.shop || '')
        setRating(found.rating || 0)
        if (found.city) setCity(found.city)
        setDistrict(found.district || '')
        setNote(found.note || '')
      }
    }
    /* 原生标题显式写一次：weapp 按页面实例隔离标题，navigateBack 出栈即销毁，
       不会残留到其它页；H5 的路由按「路径」缓存标题，不回写「新的一笔」会把
       上次编辑态的「改这一笔」带给下一次新增 —— 所以两个分支都写。 */
    Taro.setNavigationBarTitle({ title: isEdit ? '改这一笔' : '新的一笔' }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const base = editing || {}
  /* 草稿键：原生返回键没有钩子（小程序不给中断），中途退出靠「字段即存草稿」兜底。
     读写都只属于新建态 —— routeIsEdit 在首帧就可判，不吃 editing 晚一拍的时序。 */
  const DRAFT_KEY = 'fp.compose.draft.v1'
  const routeIsEdit = !!((Taro.getCurrentInstance().router || {}).params || {}).id

  const [eat, setEat] = React.useState(base.eat || '')
  const [shop, setShop] = React.useState(base.shop || '')
  const [rating, setRating] = React.useState(base.rating || 0)
  /* 新建的默认位置 = 最近一笔的城市（贴纸语言里「接着上次」）；一条记录都没有、
     或都没填过城市时落「未填」—— 与位置面板「留空」按钮、submit 的 city !== '未填'
     判空是同一套空值口径。原写死 '成都' 会在非成都用户的第一笔里先入为主地填错。 */
  const [city, setCity] = React.useState(base.city || fpRecentCities(records, 1)[0] || '未填')
  const [district, setDistrict] = React.useState(base.district || '')
  const [timeMode, setTimeMode] = React.useState('photo')
  /* 照片时间：state 而不是渲染期常量 —— 选图那一刻定格，提示与落库读同一份。 */
  const [shotAt, setShotAt] = React.useState(null)
  const [note, setNote] = React.useState(base.note || '')

  /* 位置弹层：pickProv / pickCity = 正在浏览的省、市；null 表示还在上一级列表。 */
  const [cityOpen, setCityOpen] = React.useState(false)
  const [pickProv, setPickProv] = React.useState(null)
  const [pickCity, setPickCity] = React.useState(null)
  const [stamp, setStamp] = React.useState(false)

  const shopCands = fpShopCandidates(records)
    .filter((c) => c.name !== shop.trim())
    .slice(0, 4)
  const recentCities = fpRecentCities(records, 5)

  /* 照片：编辑时沿用原图，新记录选了才存。展示与刷新由 PhotoSlot 自带的订阅承接。 */
  const photoKey = editing ? 'rec-' + editing.id : FP_NEW_PHOTO_KEY

  function pickPhoto() {
    /* 把剩余空位传下去：否则已选 3 张时还让选 5 张，多出来的会被静默丢掉。 */
    const room = fpPhotoRoom(photoKey)
    if (room <= 0) {
      Taro.showToast({ title: '最多 ' + FP_MAX_PHOTOS + ' 张，先删一张再加', icon: 'none', duration: 2000 })
      return
    }
    fpPickPhotos({ stack: true, remaining: room }).then((saved) => {
      if (!saved.length) return
      /* 追加而不是覆盖：多选几张是「加图」不是「换图」 */
      const now = fpReadPhotos(photoKey) || []
      fpWritePhotos(photoKey, now.concat(saved))
      fpNotifyPhotos()
      /* 照片时间从这一刻定格（编辑态读原时间，这里存了也不用） */
      if (!editing) setShotAt(fpNowIso())
      /* 还差一张就满时提醒一下，别让用户下次再白选 */
      const left = fpPhotoRoom(photoKey)
      if (left === 0) {
        Taro.showToast({ title: '已经满 ' + FP_MAX_PHOTOS + ' 张了', icon: 'none', duration: 1800 })
      }
    })
  }

  /* 时间提示与提交读同一份：编辑用原记录时间，新建用选图定格的 shotAt，
     一张还没选则为空 —— 提示层据此改说「选好照片，按拍下的时间记」。 */
  const photoAt = editing ? editing.at : shotAt
  const canSave = eat.trim().length > 0 && rating > 0
  const missing = eat.trim().length === 0 ? '吃了什么是必填' : rating === 0 ? '评分是必填' : null

  function submit() {
    if (!canSave || stamp) return
    /* 时间现算：写死常量会让之后每一笔都落在同一天。
       读取优先级 —— 编辑永远用原记录时间；「现在」按保存时刻；
       新建 +「照片时间」取选图定格的 shotAt，一张还没选才按保存时刻兜底
       （与 hint 的「选好照片，按拍下的时间记」是同一套说法，不冒充拍照时间）。
       原实现渲染期和保存期各算一次 fpNowIso()，提示显示 T1、落库写 T2，会漂。 */
    const at = timeMode === 'now'
      ? fpNowIso()
      : editing
        ? editing.at
        : (shotAt || fpNowIso())
    const id = editing ? editing.id : 'r' + Date.now()
    const record = {
      id,
      eat: eat.trim(),
      shop: shop.trim() ? shop.trim() : null,
      city: city && city !== '未填' ? city : null,
      district: district.trim() ? district.trim() : null,
      rating,
      at,
      note: note.trim() ? note.trim() : null,
    }
    /* 新建态的照片暂存在 __new 键下，落库时随记录一起搬家到 rec-<新id>。
       漏了这一步，时间轴和详情读 rec-<id> 会拿到空 —— 主流程（记第一笔）照片必丢。 */
    if (!editing) {
      const staged = fpReadPhotos(FP_NEW_PHOTO_KEY)
      if (staged) fpWritePhotos('rec-' + id, staged)
      fpWritePhotos(FP_NEW_PHOTO_KEY, [])
    }
    setStamp(true)
    setTimeout(() => {
      setStamp(false)
      setRecords((prev) =>
        editing ? prev.map((r) => (r.id === record.id ? record : r)) : [record].concat(prev),
      )
      /* 草稿使命结束：存完就不该再弹「已恢复」。编辑态不碰新建草稿。 */
      if (!editing) Taro.removeStorageSync(DRAFT_KEY)
      if (editing) Taro.navigateBack()
      /* app.json 没有 tabBar，switchTab 到非 tab 页会失败；routeTo.timeline 是 reLaunch。 */
      else routeTo.timeline()
    }, 430)
  }

  /* 草稿恢复（仅新建态）：有实质内容（文字或评分）才恢复并出 toast ——
     只有默认位置的「空草稿」不算，不拿噪音换惊喜。 */
  React.useEffect(() => {
    if (routeIsEdit) return
    let draft = null
    try {
      draft = JSON.parse(Taro.getStorageSync(DRAFT_KEY) || '')
    } catch (e) {
      draft = null
    }
    if (!draft) return
    if (!(draft.eat || draft.shop || draft.note || draft.rating)) return
    setEat(draft.eat || '')
    setShop(draft.shop || '')
    setRating(draft.rating || 0)
    if (draft.city) setCity(draft.city)
    setDistrict(draft.district || '')
    setNote(draft.note || '')
    if (draft.shotAt) setShotAt(draft.shotAt)
    Taro.showToast({ title: '上次没贴完的已恢复', icon: 'none', duration: 2000 })
    /* routeIsEdit 进依赖：值稳定不重跑，但让规则读得出守卫来源。 */
  }, [routeIsEdit])

  /* 草稿落盘（仅新建态）：字段一变就写；实质内容清零即删 —— 用户自己删干净的
     稿子，下次进不该又被「恢复」出来。编辑页两头都不碰它。 */
  React.useEffect(() => {
    if (routeIsEdit) return
    const hasInput = !!(eat.trim() || shop.trim() || note.trim() || rating > 0)
    if (hasInput) {
      const draft = {
        eat: eat.trim(), shop: shop.trim(), rating, city, district, note: note.trim(), shotAt,
      }
      Taro.setStorageSync(DRAFT_KEY, JSON.stringify(draft))
    } else {
      Taro.removeStorageSync(DRAFT_KEY)
    }
  }, [eat, shop, rating, city, district, note, shotAt, routeIsEdit])

  /* 中途放弃的暂存照片跟着草稿走：有草稿 = 还要回来接着写，文件留着；
     没草稿 = 放弃或已落库，文件和索引一起收 —— 只清索引的话，
     选过又放弃的照片会永远躺在持久区。编辑页的卸载同理：暂存属于
     未完成的「新的一笔」，不该被一次编辑路过顺手清掉。 */
  React.useEffect(() => () => {
    const staged = fpReadPhotos(FP_NEW_PHOTO_KEY)
    if (!staged || !staged.length) return
    if (Taro.getStorageSync(DRAFT_KEY)) return
    fpRemovePhotos(staged)
    fpWritePhotos(FP_NEW_PHOTO_KEY, [])
  }, [])

  return (
    <View className={'fp-app' + (stamp ? ' fp-stamping' : '')} style={fpAppRootStyle()}>
      {/* 返回与标题（新的一笔/改这一笔）由原生导航栏承担，页内头部只作留白。 */}
      <View className="fp-head" />

      <View className="fp-scroll fp-scroll-dock">
        <View className="fp-form fp-enter">
          <View className="fp-drop fp-enter-1">
            <PhotoSlot
              id={photoKey}
              emptyText="拍照或相册"
              stack
              onTap={pickPhoto}
            />
            <PhotoStrip id={photoKey} onPick={pickPhoto} />
          </View>

          <View className="fp-field fp-enter-2">
            <View className="fp-label">
              <Text>吃了什么</Text>
              <Text className="fp-req">必填</Text>
            </View>
            {/* 不摆候选 chips：每顿吃的本来就不一样，推一排「吃过的」只会让人误以为是预选值。 */}
            {/* -1 = 不限长：weapp Input 默认 140 会静默截断，H5 端却无限制，
                两端行为对不齐 —— 显式放开后录入什么存什么。
                小写 maxlength 是 weapp 模板真正认的键（maxLength 驼峰不映射）。 */}
            <Input
              className="fp-input"
              value={eat}
              placeholder="甜水面"
              placeholderClass="fp-input-ph"
              maxLength={-1}
              /* eslint-disable-next-line react/jsx-no-duplicate-props -- 驼峰+小写双写是 weapp Input 模板要求 */
              maxlength={-1}
              onInput={(e) => setEat(e.detail.value)}
            />
          </View>

          <View className="fp-field fp-enter-3">
            <View className="fp-label">
              <Text>评分</Text>
              <Text className="fp-req">必填</Text>
            </View>
            <RatingInput value={rating} onChange={setRating} />
          </View>

          <View className="fp-field fp-enter-4">
            <View className="fp-label">
              <Text>店</Text>
              <Text className="fp-opt">可空</Text>
            </View>
            <Input
              className="fp-input fp-input-sm"
              value={shop}
              placeholder="没有店就留空"
              placeholderClass="fp-input-ph"
              maxLength={-1}
              /* eslint-disable-next-line react/jsx-no-duplicate-props -- 驼峰+小写双写是 weapp Input 模板要求 */
              maxlength={-1}
              onInput={(e) => setShop(e.detail.value)}
            />
            <View className="fp-sug">
              {shopCands.map((c) => (
                <View
                  key={c.name}
                  className="fp-chip"
                  hoverClass="fp-hover"
                  onClick={() => {
                    setShop(c.name)
                    if (c.city) { setCity(c.city); setCityOpen(false) }
                    setDistrict(c.district || '')
                  }}
                >
                  {c.city ? c.name + '（' + c.city + '）' : c.name}
                </View>
              ))}
            </View>
          </View>

          <View className="fp-field fp-enter-5">
            <View className="fp-label">
              <Text>位置</Text>
              <Text className="fp-opt">可改</Text>
            </View>
            <View className="fp-auto">
              <Text className="fp-auto-val">
                {city}
                {district ? ' ' + district : ''}
              </Text>
              <View
                className="fp-auto-edit"
                hoverClass="fp-hover"
                onClick={() => { setCityOpen(true); setPickProv(null); setPickCity(null) }}
              >
                改
              </View>
            </View>
            {/* 最近去过：记录里真实出现过的城市，一行常驻，一步直达；其余走弹层里的全国列表。
                换城市必须清掉旧区县，否则会写出「上海 · 锦江区」这种自相矛盾的位置。 */}
            {recentCities.length ? (
              <View className="fp-area-row">
                <Text className="fp-area-lab">最近去过</Text>
                <View className="fp-sug fp-sug-line">
                  {recentCities.map((c) => (
                    <View
                      key={c}
                      className={'fp-chip' + (c === city ? ' fp-on' : '')}
                      hoverClass="fp-hover"
                      onClick={() => { setCity(c); setDistrict('') }}
                    >
                      {c}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <View className="fp-field fp-enter-6">
            <View className="fp-label">
              <Text>时间</Text>
              <Text className="fp-opt">可改</Text>
            </View>
            <View className="fp-time-row">
              <View className="fp-seg">
                <View
                  className={'fp-seg-btn' + (timeMode === 'photo' ? ' fp-on' : '')}
                  hoverClass="fp-hover"
                  onClick={() => setTimeMode('photo')}
                >
                  {editing ? '原时间' : '照片时间'}
                </View>
                <View
                  className={'fp-seg-btn' + (timeMode === 'now' ? ' fp-on' : '')}
                  hoverClass="fp-hover"
                  onClick={() => setTimeMode('now')}
                >
                  现在
                </View>
              </View>
              <Text className="fp-hint">
                {timeMode === 'now'
                  ? '刚刚'
                  : photoAt
                    ? formatWhen(photoAt)
                    : '选好照片，按拍下的时间记'}
              </Text>
            </View>
          </View>

          <View className="fp-field fp-enter-7">
            <View className="fp-label">
              <Text>短评</Text>
              <Text className="fp-opt">可空</Text>
            </View>
            <Input
              className="fp-input fp-input-sm"
              value={note}
              placeholder="一句话就好"
              placeholderClass="fp-input-ph"
              maxLength={-1}
              /* eslint-disable-next-line react/jsx-no-duplicate-props -- 驼峰+小写双写是 weapp Input 模板要求 */
              maxlength={-1}
              onInput={(e) => setNote(e.detail.value)}
            />
          </View>
        </View>
      </View>

      <View className="fp-dock">
        <View
          className={'fp-btn fp-btn-primary fp-stamp-target' + (canSave ? '' : ' fp-disabled')}
          hoverClass="fp-hover"
          onClick={submit}
        >
          <Icon name="face" size={20} color={canSave ? FP_COLORS.accentInk : FP_COLORS.disabledInk} />
          <Text>{FP_VARIANT.composeCta}</Text>
        </View>
        {missing ? (
          <View className="fp-blockhint" aria-live="polite" aria-atomic="true">{missing}，先补齐才能存</View>
        ) : null}
      </View>

      {/* 位置选择弹层：省 → 市 → 区县逐级推进；头部 ← 逐级返回；选完即收。 */}
      {cityOpen ? (
        <View className="fp-confirm" role="dialog" aria-modal="true" aria-label="选择位置">
          <View className="fp-area-mask" onClick={() => setCityOpen(false)} />
          <View className="fp-area-pop">
            <View className="fp-area-head">
              {pickCity ? (
                <View className="fp-area-back" hoverClass="fp-hover" onClick={() => setPickCity(null)}>
                  ← {pickCity}
                </View>
              ) : pickProv ? (
                <View className="fp-area-back" hoverClass="fp-hover" onClick={() => setPickProv(null)}>
                  ← {pickProv}
                </View>
              ) : null}
              <Text className="fp-area-lab">{pickCity || pickProv || '选择位置'}</Text>
              <Text className="fp-area-sub">
                {pickCity
                  ? fpAreaDistricts(pickProv, pickCity).length + ' 区县'
                  : pickProv
                    ? fpAreaCities(pickProv).length + ' 市'
                    : fpProvinces().length + ' 省'}
              </Text>
              <View className="fp-area-close" aria-label="关闭" hoverClass="fp-hover" onClick={() => setCityOpen(false)}>
                <Text>✕</Text>
              </View>
            </View>

            <View className="fp-area-list fp-area-list-pop">
              {pickCity
                ? /* 第三级：该市的区县。选中即写入位置并收面板。 */
                  fpAreaDistricts(pickProv, pickCity).map((d) => (
                    <View
                      key={d}
                      className={'fp-arearow' + (d === district ? ' fp-on' : '')}
                      hoverClass="fp-hover"
                      onClick={() => { setCity(pickCity); setDistrict(d); setCityOpen(false) }}
                    >
                      <Text>{d}</Text>
                      {d === district ? <Text className="fp-area-now">当前</Text> : null}
                    </View>
                  ))
                : pickProv
                  ? /* 第二级：该省的市。直辖市的「市辖区」占一行，选中直接进入该市的区县。 */
                    fpAreaCities(pickProv).map((c) => (
                      <View
                        key={c}
                        className={'fp-arearow' + (c === city ? ' fp-on' : '')}
                        hoverClass="fp-hover"
                        onClick={() => { setPickCity(c); setDistrict('') }}
                      >
                        <Text>{c}</Text>
                        <Text className="fp-area-n">{fpAreaDistricts(pickProv, c).length}</Text>
                      </View>
                    ))
                  : /* 第一级：全国 34 省。 */
                    fpProvinces().map((p) => (
                      <View
                        key={p}
                        className="fp-arearow"
                        hoverClass="fp-hover"
                        onClick={() => setPickProv(p)}
                      >
                        <Text>{p}</Text>
                        <Text className="fp-area-n">{fpAreaCities(p).length}</Text>
                      </View>
                    ))}
            </View>

            {pickCity ? (
              <View
                className="fp-arearow fp-area-skip"
                hoverClass="fp-hover"
                onClick={() => { setCity(pickCity); setDistrict(''); setCityOpen(false) }}
              >
                只选城市 · 不填区县
              </View>
            ) : null}
            <View
              className="fp-arearow fp-area-none"
              hoverClass="fp-hover"
              onClick={() => { setCity('未填'); setDistrict(''); setCityOpen(false) }}
            >
              留空
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}

/* 与 data/core.js 的 fpWhen 同一口径：今天按真实当前时刻判。
   这里不直接引 fpWhen：该页的「现在/照片时间」提示只读不改，独立一份更直白。 */
function formatWhen(iso) {
  const d = new Date(iso)
  const p = (n) => (n < 10 ? '0' + n : String(n))
  const now = new Date()
  const hm = p(d.getHours()) + ':' + p(d.getMinutes())
  return d.toDateString() === now.toDateString()
    ? '今天 ' + hm
    : p(d.getMonth() + 1) + '月' + p(d.getDate()) + '日 ' + hm
}
