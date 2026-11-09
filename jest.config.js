/* jest 配置。
   只测纯逻辑：core.js 的派生函数、china-map 的路径解析（从 city 页抽出来的同源实现）。
   所有 @tarojs/* 在 __mocks__ 里被替换成空壳 —— 被测函数里只有 Taro.getStorageSync
   这一类同步 API 的调用点，mock 成内存 Map 就够，不需要真跑小程序环境。 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.js'],
  /* babel-jest 复用项目 babel.config.js（taro preset），JSX / ESM 直接跑 */
  transform: {
    '^.+\\.jsx?$': ['babel-jest', { configFile: './babel.config.js' }],
  },
  /* @tarojs/taro 在 node_modules 里且带 ESM 构建产物，jest 不会去转它 ——
     直接映射到 test/__mocks__/taro.js（内存版 storage + 记录式文件 API）。
     这样被测代码 import 的 'from @tarojs/taro' 就是我们的空壳，不需要 jest.mock()。 */
  moduleNameMapper: {
    '^@tarojs/taro$': '<rootDir>/test/__mocks__/taro.js',
  },
  /* node_modules 里的 ESM 产物一律不碰（上面已经把 taro 映射走了） */
  transformIgnorePatterns: ['/node_modules/'],
  /* Taro 的 storage 是同步 API，mock 保持同步语义 */
  clearMocks: true,
  collectCoverageFrom: [
    'src/data/core.js',
    'src/data/photo.js',
    'src/data/store.js',
  ],
}
