/* Taro 构建配置。
   原型体积大（地图 path 数据 3 万字 + 行政区划 4 万字），关闭不相关的优化以缩短构建时间。 */
const path = require('path')

/* weapp 与 h5 产物分目录，避免互相覆盖（微信开发者工具指向 dist，h5 预览指向 dist-h5） */
const outputRoot = process.env.TARO_ENV === 'h5' ? 'dist-h5' : 'dist'

module.exports = {
  projectName: 'food-checkin-mp',
  date: '2026-10-15',
  /* 原型是 375 宽基准的移动布局。pxtransform 换算：weapp rpx = px × deviceRatio[designWidth]，
     designWidth 375 + ratio 2 → 1 设计 px = 2rpx（= 750 设计稿语义），两端同源（Taro.pxTransform 公式一致）。 */
  designWidth: 375,
  deviceRatio: {
    375: 2,
    750: 1,
    640: 2.34 / 2,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot,
  plugins: [],
  defineConstants: {},
  copy: {
    /* 两类原样进产物：
       1. static/ —— 首访空态引用的五张示例照（static/photos/stack-*.jpg），
          走的是 /static/photos/... 绝对路径，不 copy 的话产物里根本没有这些文件。
          目标跟随 outputRoot：写死 dist/ 时 h5 端（dist-h5）永远缺文件，页面上是一排碎图。
       2. src/sitemap.json —— 微信搜索索引配置，Taro 不会自动搬到产物根目录。
       小程序包体上限 2MB（主包 1.5MB），引入静态资源后要盯住体积。 */
    patterns: [
      { from: 'static', to: outputRoot + '/static' },
      { from: 'src/sitemap.json', to: outputRoot + '/sitemap.json' },
    ],
    options: {},
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: { enable: false },
  },
  alias: {
    '@': path.resolve(__dirname, '..', 'src'),
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: { limit: 1024 },
      },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    postcss: {
      autoprefixer: { enable: true, config: {} },
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false },
    },
    devServer: { port: 10086, host: '127.0.0.1' },
  },
}
