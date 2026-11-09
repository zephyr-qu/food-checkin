/* 标题单源头在 data/demo-records.js 的 FP_VARIANT：这里引它，不再另写一份。
   两处各写一遍，改产品名时漏掉哪一处都不会报错，只会静默不一致。 */
import { FP_VARIANT } from './data/demo-records'
import { FP_COLORS } from './styles/tokens'

export default defineAppConfig({
  pages: [
    'pages/timeline/index',
    'pages/city/index',
    'pages/detail/index',
    'pages/compose/index',
    'pages/shop/index',
    'pages/citydetail/index',
  ],
  window: {
    navigationBarTitleText: FP_VARIANT.title,
    navigationBarBackgroundColor: FP_COLORS.paper,
    navigationBarTextStyle: 'black',
    backgroundColor: FP_COLORS.paper,
  },
  // 自定义导航栏会破坏原型的固定头布局，这里用原生导航栏承担返回与页面标题；
  // 页内头部只作留白（详情页另保留右上日期签），编辑态标题用 setNavigationBarTitle 切换。
  lazyCodeLoading: 'requiredComponents',
})
