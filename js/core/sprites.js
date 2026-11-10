/**
 * 雪碧图资源表（全部美术来自两张 5x5 雪碧图）
 *
 * 猫咪头像雪碧图 assets/textures/cats/cat_atlas.png   1024x1024
 * 道具雪碧图     assets/textures/icons/icon_atlas.png  1024x1024
 *
 * 注意：文件名必须为纯 ASCII —— 微信小游戏 wx.createImage() 对中文路径会加载失败
 *
 * 两张图都是 5 行 5 列、行优先编号 0..24：index = 行 * 5 + 列
 * 每格的像素区间 xs/ys 由实际内容精确测量得到（格子间距不均匀，故逐格记录）
 * 第 24 号格（右下角）带生成水印，不使用 —— 可用帧为 0..23
 *
 * 需要调整美术对应关系时，只改下面的 catFrames / iconFrames 两张表即可
 */
var SPRITES = {
  /** 每张雪碧图的格子布局 */
  atlases: {
    cat: {
      path: 'assets/textures/cats/cat_atlas.png',
      cols: 5,
      rows: 5,
      xs: [[36, 212], [234, 409], [428, 609], [627, 807], [826, 1007]],
      ys: [[36, 212], [234, 409], [428, 609], [627, 807], [826, 1007]]
    },
    icon: {
      path: 'assets/textures/icons/icon_atlas.png',
      cols: 5,
      rows: 5,
      xs: [[46, 175], [244, 379], [438, 591], [650, 787], [850, 1001]],
      ys: [[46, 175], [244, 379], [438, 591], [650, 787], [850, 1001]]
    }
  },

  /** 可用帧数量（0..23），第 24 格是水印格 */
  usable: 24,

  /** 猫咪品种 typeId -> 雪碧图帧号（对应 core/catTypes.js） */
  catFrames: {
    ju: 1,       // 橘猫（橘虎斑）
    bei: 0,      // 英国短毛猫（蓝猫）
    buou: 2,     // 布偶猫
    xianluo: 6,  // 暹罗猫
    zheer: 7,    // 苏格兰折耳猫
    bosi: 5,     // 波斯猫
    mianyin: 10, // 缅因猫（长毛棕虎斑）
    bao: 11,     // 孟加拉豹猫
    wumao: 13,   // 加拿大无毛猫
    sanhua: 4,   // 三花猫
    yiguo: 15,   // 异国短毛猫（加菲）
    lihua: 8     // 狸花猫
  },

  /** 道具 / 家具 / 疾病图标 -> 雪碧图帧号（对应 core/shop.js 与 catTypes.js 的 icon 字段） */
  iconFrames: {
    // 食物
    food_fish: 6,      // 小鱼形猫饼
    food_can: 23,      // 猫罐头
    food_pudding: 7,   // 三文鱼块
    // 玩具
    toy_mint: 2,       // 老鼠玩具
    toy_wand: 1,       // 羽毛逗猫棒
    toy_ball: 0,       // 毛线球
    // 家具
    fur_bed: 17,       // 毯子 / 猫窝
    fur_tree: 10,      // 猫抓板（剑麻柱）
    fur_bowl: 12,      // 洞洞球（自动喂食器）
    // 咪窝
    home: 4,           // 纸箱
    // 闯关道具
    prop_hint: 15,     // 星星闪光
    prop_shuffle: 14,  // 转盘轨道球
    prop_bomb: 13,     // 弹簧玩具
    prop_time: 20,     // 金色铃铛
    // 疾病
    sick_cold: 19,     // 围巾
    sick_skin: 18,     // 梳毛刷
    sick_stomach: 21,  // 条纹玩具鱼
    sick_bone: 22,     // 猫爪印
    sick_depress: 11   // 隧道（躲起来）
  },

  /** 心情角标（雪碧图只有一套立绘，用 emoji 角标区分状态；用代理对写法避免老引擎不兼容） */
  moodEmoji: {
    happy: '\uD83D\uDE3A',   // 😺
    hungry: '\uD83D\uDE3E',  // 😾
    dirty: '\uD83D\uDEC1',   // 🛁
    sick: '\uD83E\uDD12',    // 🤒
    sad: '\uD83D\uDE3F'      // 😿
  },

  /** 棋盘图块总数：1..24 猫脸帧（cats）+ 25..48 道具帧（icons），同一局内每种图案唯一 */
  tileCount: 48,

  /** 棋盘图块 id -> 所用雪碧图 */
  tileAtlas: function (id) {
    return (id - 1) < this.usable ? 'cat' : 'icon';
  },

  /** 棋盘图块 id -> 对应雪碧图内的帧号 */
  tileIndexOf: function (id) {
    var i = (id - 1) % (this.usable * 2);
    if (i < 0) i += this.usable * 2;
    return i < this.usable ? i : i - this.usable;
  },

  /** 取某一帧在雪碧图中的像素矩形 {sx, sy, sw, sh} */
  rect: function (atlasName, index) {
    var a = this.atlases[atlasName];
    if (!a) return null;
    if (!(index >= 0)) index = 0;
    if (index >= this.usable) index = index % this.usable;
    var c = index % a.cols;
    var r = Math.floor(index / a.cols) % a.rows;
    var x = a.xs[c], y = a.ys[r];
    return { sx: x[0], sy: y[0], sw: x[1] - x[0] + 1, sh: y[1] - y[0] + 1 };
  }
};

module.exports = SPRITES;
