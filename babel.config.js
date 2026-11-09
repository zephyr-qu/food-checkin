/* babel 配置：走 Taro 官方 preset（含 JSX / TS 转换与 weapp 运行时补丁）。 */
module.exports = {
  presets: [['taro', { framework: 'react', ts: false }]],
}
