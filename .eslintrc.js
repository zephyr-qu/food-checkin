// 基础护栏：抓未定义变量、无效属性、明显笔误这类编译前低级错误。
// 规则从简，避免与现有代码风格大面积冲突后被迫全员关闭。
module.exports = {
  root: true,
  extends: ['taro'],
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: 'detect' } },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-undef': 'error',
    'react/jsx-key': 'warn',
    /* 与现有代码风格冲突的偏好类规则：不在护栏范围，保持关闭 */
    'jsx-quotes': 'off',
    'import/no-commonjs': 'off',
  },
  globals: {
    definePageConfig: 'readonly',
    defineAppConfig: 'readonly',
  },
  overrides: [
    {
      files: ['config/**/*.js'],
      env: { node: true },
    },
    {
      /* 测试跑在 jest 环境里（node + jest globals），与 src 的小程序环境分开 */
      files: ['test/**/*.js'],
      env: { node: true, jest: true },
    },
  ],
}
