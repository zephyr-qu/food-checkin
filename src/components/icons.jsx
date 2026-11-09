/* 图标：小程序无 <svg>，用 base64 编码的 SVG 转成 <image> 显示。
   原型靠 currentColor 跟随按钮字色 —— 这里改为把颜色显式烘焙进 SVG（参数 color），
   调用处传色值即可（等价于 currentColor 的用法，但编译期定死）。 */
import React from 'react'
import Taro from '@tarojs/taro'
import { Image, View } from '@tarojs/components'
import { FP_COLORS } from '../styles/tokens'

/* 细线描边参数与原型 icons.jsx 一致。 */
const S = (color) =>
  `fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`

const PATHS = {
  plus: (c) => `<path d="M12 5v14M5 12h14" ${S(c)}/>`,
  back: (c) => `<path d="M15 5l-7 7 7 7" ${S(c)}/>`,
  camera: (c) => `<path d="M3 8.5A2.5 2.5 0 015.5 6h1.7l1-1.6h5.6L15 6h3.5A2.5 2.5 0 0121 8.5v8A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5z" ${S(c)}/><circle cx="12" cy="12.5" r="3.4" ${S(c)}/>`,
  pin: (c) => `<path d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 10-13 0C5.5 14.9 12 21 12 21z" ${S(c)}/><circle cx="12" cy="10" r="2.4" ${S(c)}/>`,
  clock: (c) => `<circle cx="12" cy="12" r="8.5" ${S(c)}/><path d="M12 7.6V12l3 1.9" ${S(c)}/>`,
  edit: (c) => `<path d="M4 20h4l10-10a2.4 2.4 0 00-3.4-3.4L4.6 16.6z" ${S(c)}/><path d="M13.8 6.9l3.3 3.3" ${S(c)}/>`,
  trash: (c) => `<path d="M4.5 7h15M9.5 7V5.2h5V7M6.5 7l1 12.2h9L17.5 7" ${S(c)}/><path d="M10.4 10.5v5.4M13.6 10.5v5.4" ${S(c)}/>`,
  chevron: (c) => `<path d="M9 5l7 7-7 7" ${S(c)}/>`,
  face: (c) => `<circle cx="12" cy="12" r="9.2" ${S(c)}/><circle cx="8.9" cy="10.3" r="1.3" fill="${c}"/><circle cx="15.1" cy="10.3" r="1.3" fill="${c}"/><path d="M7.7 14c1.05 1.85 2.5 2.75 4.3 2.75S15.25 15.85 16.3 14" ${S(c)}/>`,
  download: (c) => `<path d="M12 4v11" ${S(c)}/><path d="M7.5 10.5L12 15l4.5-4.5" ${S(c)}/><path d="M4.5 19h15" ${S(c)}/>`,
  upload: (c) => `<path d="M12 15V4" ${S(c)}/><path d="M7.5 8.5L12 4l4.5 4.5" ${S(c)}/><path d="M4.5 19h15" ${S(c)}/>`,
}

/* 按「形状 + 颜色」缓存 dataURL：同一个图标在列表里会被重复渲染几十次。 */
const cache = {}
function iconUrl(name, color) {
  const k = name + '|' + color
  if (!cache[k]) {
    const body = PATHS[name](color)
    const svg =
      `data:image/svg+xml,` +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>`,
      )
    cache[k] = svg
  }
  return cache[k]
}

/* size 按设计稿 px 计。内联 style 不经 postcss，用 Taro.pxTransform 显式换算
   （weapp 得 rpx、h5 得 rem，与样式层 pxtransform 同一配置，两端一致）。 */
export function Icon({ name, size = 20, color = FP_COLORS.ink, style }) {
  const s = Taro.pxTransform(size)
  return (
    <Image
      className="fp-icon"
      src={iconUrl(name, color)}
      mode="aspectFit"
      style={{ width: s, height: s, display: 'inline-block', verticalAlign: '-0.15em', ...(style || {}) }}
    />
  )
}

/* 包一层 View 的空壳版本，用于需要块级占位的地方（空态大图标）。 */
export function IconBlock({ name, size = 20, color = FP_COLORS.ink, style }) {
  return (
    <View className="fp-iconblock" style={style}>
      <Icon name={name} size={size} color={color} />
    </View>
  )
}

export default Icon
