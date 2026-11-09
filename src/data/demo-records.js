/* 内置示例记录与全局常量。字段与原型严格一致：
   打卡 = 一道食物，店可选，城市/区县可选，评分 1–5 整数。
   注意：示例数据只用于「一份看得懂的初始数据」，时间固定是它的展示属性，
   运行时的一切时间（今天/现在）都以 new Date() 现算，不引用这里的日期。 */

/* 首屏空态那摞示例照（bits 的 Empty intro 引用）；路径相对包根：
   weapp 落 miniprogramRoot 下、H5 落站点根，两端同一条字符串都解析得到。 */
export const FP_INTRO_PHOTOS = [
  '/static/photos/stack-1.jpg',
  '/static/photos/stack-2.jpg',
  '/static/photos/stack-3.jpg',
  '/static/photos/stack-4.jpg',
  '/static/photos/stack-5.jpg',
]

/* 示例态样照（storage 无记录、启用内置示例时由 store.js 写入）：
   甜水面两张看叠层、凉皮一张看单图 —— 共 3 张，与真实照片同一条通道
   （fpWritePhotos('rec-<id>')）；用户删过（fpReadPhotos !== null）就不再补写。 */
export const FP_DEMO_PHOTO_SEEDS = [
  { id: 'r1', photos: ['/static/photos/stack-1.jpg', '/static/photos/stack-5.jpg'] },
  { id: 'r10', photos: ['/static/photos/stack-2.jpg'] },
]

export const FP_RECORDS = [
  { id: 'r1', eat: '甜水面', shop: '马旺子川小馆', city: '成都', district: '锦江区', rating: 5,
    at: '2026-10-09T12:30:00', note: '面条筋道，甜辣刚好。辣子是现舂的，香得不像话。' },
  { id: 'r2', eat: '冰粉', shop: '马旺子川小馆', city: '成都', district: '锦江区', rating: 4,
    at: '2026-10-09T13:10:00', note: null },
  { id: 'r3', eat: '跷脚牛肉', shop: '古市香跷脚牛肉', city: '乐山', rating: 5,
    at: '2026-10-08T18:40:00', note: '汤头清而厚，蘸水是灵魂。' },
  { id: 'r4', eat: '钵钵鸡', shop: '叶婆婆钵钵鸡', city: '乐山', rating: 4,
    at: '2026-10-07T20:15:00', note: null },
  { id: 'r5', eat: '番茄牛腩', shop: null, city: null, rating: 4,
    at: '2026-09-27T19:00:00', note: '自己炖的，番茄放多了。' },
  { id: 'r6', eat: '蛋烘糕', shop: '贺记蛋烘糕', city: '成都', rating: 3,
    at: '2026-09-21T16:20:00', note: null },
  { id: 'r7', eat: '生煎包', shop: '大壶春', city: '上海', district: '黄浦区', rating: 4,
    at: '2026-08-15T08:30:00', note: null },
  { id: 'r8', eat: '小笼包', shop: '南翔馒头店', city: '上海', district: '黄浦区', rating: 5,
    at: '2026-08-14T11:50:00', note: '皮薄汁多，排队四十分钟。' },
  { id: 'r9', eat: '肉夹馍', shop: '老米家大雨肉夹馍', city: '西安', rating: 5,
    at: '2026-10-05T12:00:00', note: '腊汁肉肥瘦刚好，馍是现打的。' },
  { id: 'r10', eat: '凉皮', shop: '盛志望麻酱酿皮', city: '西安', rating: 4,
    at: '2026-10-05T13:20:00', note: null },
  { id: 'r11', eat: '羊肉泡馍', shop: '老孙家泡馍', city: '西安', rating: 4,
    at: '2026-10-06T18:30:00', note: '自己掰馍，掰成黄豆大，煮出来才入味。' },
  { id: 'r12', eat: '北京烤鸭', shop: '四季民福', city: '北京', district: '东城区', rating: 5,
    at: '2026-09-30T18:00:00', note: '鸭子当桌现片，皮脆得掉渣。' },
  { id: 'r13', eat: '豆汁儿', shop: '尹三豆汁', city: '北京', rating: 3,
    at: '2026-10-01T08:10:00', note: '酸香上头，喝不惯但总算试过了。' },
  { id: 'r14', eat: '肠粉', shop: '源记肠粉', city: '广州', rating: 5,
    at: '2026-09-20T08:40:00', note: null },
  { id: 'r15', eat: '煲仔饭', shop: '超记煲仔饭', city: '广州', rating: 4,
    at: '2026-09-20T19:10:00', note: '饭焦脆而不糊，淋酱油那一下是灵魂。' },
  { id: 'r16', eat: '片儿川', shop: '奎元馆', city: '杭州', rating: 4,
    at: '2026-09-12T11:30:00', note: null },
  { id: 'r17', eat: '定胜糕', shop: '知味观', city: '杭州', rating: 3,
    at: '2026-09-12T15:00:00', note: null },
  { id: 'r18', eat: '鸭血粉丝汤', shop: '回味鸭血粉丝', city: '南京', rating: 4,
    at: '2026-08-28T12:20:00', note: null },
  { id: 'r19', eat: '盐水鸭', shop: '韩复兴', city: '南京', rating: 5,
    at: '2026-08-28T17:40:00', note: '桂花香，皮白肉嫩，斩半只带走。' },
  { id: 'r20', eat: '响油鳝糊', shop: '松鹤楼', city: '苏州', rating: 4,
    at: '2026-08-29T18:50:00', note: null },
  { id: 'r21', eat: '热干面', shop: '蔡林记', city: '武汉', rating: 5,
    at: '2026-08-20T07:50:00', note: '芝麻酱要趁热拌开，凉了就坨了。' },
  { id: 'r22', eat: '豆皮', shop: '老通城豆皮', city: '武汉', rating: 4,
    at: '2026-08-20T12:10:00', note: null },
  { id: 'r23', eat: '臭豆腐', shop: '文和友', city: '长沙', rating: 4,
    at: '2026-08-08T16:30:00', note: null },
  { id: 'r24', eat: '糖油粑粑', shop: '金记糖油粑粑', city: '长沙', rating: 5,
    at: '2026-08-08T16:50:00', note: '刚出锅烫嘴，甜得理直气壮。' },
  { id: 'r25', eat: '沙茶面', shop: '月华沙茶面', city: '厦门', rating: 5,
    at: '2026-07-25T11:40:00', note: '加料要了大肠和豆腐，汤头是花生酱的底。' },
  { id: 'r26', eat: '海蛎煎', shop: '莲欢海蛎煎', city: '厦门', rating: 4,
    at: '2026-07-25T15:20:00', note: null },
  { id: 'r27', eat: '过桥米线', shop: '建新园', city: '昆明', rating: 4,
    at: '2026-07-18T10:30:00', note: null },
  { id: 'r28', eat: '腊排骨', shop: '阿婆腊排骨', city: '丽江', rating: 5,
    at: '2026-07-19T19:20:00', note: '古城边人少的一家，排骨咸香带甜。' },
  { id: 'r29', eat: '排骨米饭', shop: '万和春', city: '青岛', rating: 4,
    at: '2026-06-28T12:00:00', note: null },
  { id: 'r30', eat: '把子肉', shop: '超然居', city: '济南', rating: 5,
    at: '2026-06-29T12:30:00', note: '肥而不腻，浇一勺肉汤在米饭上。' },
  { id: 'r31', eat: '鸡架', shop: '老迟家鸡架', city: '沈阳', rating: 4,
    at: '2026-06-14T19:40:00', note: '烤鸡架撒孜然，啃着下酒。' },
  { id: 'r32', eat: '锅包肉', shop: '老厨家', city: '哈尔滨', rating: 5,
    at: '2026-06-15T17:30:00', note: '酸甜口，外壳咔嚓响，东北名不虚传。' },
  { id: 'r33', eat: '牛肉面', shop: '马子禄', city: '兰州', rating: 5,
    at: '2026-05-30T08:20:00', note: '二细，汤要清，辣子要浮一层。' },
  { id: 'r34', eat: '大盘鸡', shop: '血站大盘鸡', city: '乌鲁木齐', rating: 4,
    at: '2026-05-31T20:00:00', note: null },
  { id: 'r35', eat: '桂林米粉', shop: '崇善米粉', city: '桂林', rating: 4,
    at: '2026-05-16T08:30:00', note: null },
  { id: 'r36', eat: '碗托', shop: '梁先扣平遥碗托', city: '平遥', rating: 4,
    at: '2026-05-02T13:10:00', note: null },
  { id: 'r37', eat: '生煎包', shop: '大壶春', city: '上海', rating: 5,
    at: '2026-09-14T08:40:00', note: '第二次来，还是脆底 —— 这家店算吃明白了。' },
  { id: 'r38', eat: '番茄鸡蛋面', shop: null, city: null, rating: 5,
    at: '2026-04-12T19:20:00', note: '在家做的，加了个荷包蛋。' },
];

/* 录入页「店」无历史记录时的兜底候选。 */
export const FP_SHOP_ENTITIES = [
  '马旺子川小馆', '古市香跷脚牛肉', '叶婆婆钵钵鸡', '贺记蛋烘糕', '大壶春', '南翔馒头店',
  '老米家大雨肉夹馍', '盛志望麻酱酿皮', '老孙家泡馍', '四季民福', '尹三豆汁', '源记肠粉',
  '超记煲仔饭', '奎元馆', '知味观', '回味鸭血粉丝', '韩复兴', '松鹤楼', '蔡林记',
  '老通城豆皮', '文和友', '金记糖油粑粑', '月华沙茶面', '莲欢海蛎煎', '建新园',
  '阿婆腊排骨', '万和春', '超然居', '老迟家鸡架', '老厨家', '马子禄', '血站大盘鸡',
  '崇善米粉', '梁先扣平遥碗托',
];

/* 定稿视觉方向：抹茶贴纸。小程序只保留这一套，不再按 data-variant 切换多套皮肤。 */
export const FP_VARIANT = {
  id: 'matcha',
  title: 'X师傅美食记',
  cityTitle: '美食足迹',
  dockCta: '贴一张',
  composeCta: '贴 上 去',
  /* 头行是 标题+统计 一行并排（flex 不换行时代），「已贴」二字挤掉的是
     标题的省略余量 —— 统计短一截，标题保完整。语义仍读得通（N 笔 M 城）。 */
  statsLabel: 'N 笔 M 城',
};
