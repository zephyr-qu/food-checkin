/* 色值 token 的 JS 侧镜像 —— 唯一真源是 src/styles/fp.css 的 matcha 方向块
   （`.fp-app { --paper… --badge-ink… }`，标尺谱系见同文件 matcha 注释块）。
   为什么 JS 里还要一份：Icon 把颜色烘焙进 SVG data-URI（icons.jsx 按 color 做缓存键），
   Canvas / wx.showModal 这类原生接口也读不到 CSS 变量。
   规则：JS 里不许出现裸色值，一律 import 这里；改色先改 fp.css，再同步本文件。
   小程序只保留 matcha 一套皮肤（见 data/demo-records.js 中 FP_VARIANT 的注释）。 */

export const FP_COLORS = {
  /* --ink：正文墨（标尺 950 档），Icon 组件的默认色（替代旧残留 #1d211e） */
  ink: '#11221a',
  /* --accent-deep（700 档）：选中/强调的深档（替代标尺外私生色 #2f6b4f） */
  accentDeep: '#377257',
  /* --accent-ink：强调底上的字；matcha 方向里是墨不是白 */
  accentInk: '#11221a',
  /* --badge-ink：深色圆片上的白字/白图标 */
  badgeInk: '#ffffff',
  /* --btn-disabled-ink：禁用态的字与图 */
  disabledInk: 'rgba(17,34,26,.58)',
  /* --icon-faint：图标灰（ink @55%，替代孤色 #8b908b）。
     实测对比度：缩略图槽 #d4e8df 上 3.50、tint #ebf4f0 上 3.65、白卡 3.78 —— 均过非文本 3:1 */
  iconFaint: 'rgba(17,34,26,.55)',
  /* --paper：台面纸底（导航栏 / 页面背景同源） */
  paper: '#f6f6f4',
  /* --accent（500 档）：主强调；Canvas 当前省填充 */
  accent: '#50a57f',
  /* --tint-a（100 档）：浅底；Canvas 陆地填充 */
  tintA: '#ebf4f0',
  /* --tint-thumb（200 档）：缩略图底；Canvas 有记录省填充 */
  tintThumb: '#d4e8df',
  /* --line：分隔线 / 省界描边（200 档） */
  line: '#c0ded0',
  /* 印泥朱砂。压白纸 8.91:1，色相离开抹茶约 135° */
  danger: '#7A342E',
}
