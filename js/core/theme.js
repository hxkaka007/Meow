/**
 * 主题皮肤系统（GDD 皮肤切换）
 * 4 套粉彩主题：奶油甜心（默认）/ 薄荷奶绿 / 樱花物语 / 海盐蓝莓
 * 所有主题均为浅色系，场景内暖棕文字在各底色上均可读
 *
 * 字段说明：
 *  bg/bgTop/bgBottom  全局背景（顶部到底部渐变）
 *  card/cardSoft      卡片底色 / 柔和卡片底
 *  pink/yellow/blue/green/purple  功能卡片点缀色
 *  primary/primary2   主按钮渐变
 *  go/go2             "去完成"绿色按钮渐变
 *  title/text/sub     标题强调色 / 正文 / 次要文字
 *  sticker            贴纸装饰色
 *  navActive          底部导航选中色
 */
var Save = require('./save.js');

var THEMES = {
  cream: {
    name: '奶油甜心',
    bgTop: '#FDF8EC', bgBottom: '#F7E2C2',
    card: '#FFFFFF', cardSoft: '#FFF9EE',
    pink: '#FFE4EA', yellow: '#FFF3C9', blue: '#DFF0FB', green: '#E5F6DC', purple: '#F0E6F9',
    primary: '#FF9A62', primary2: '#FFB88A',
    go: '#8BD06A', go2: '#B0E892',
    title: '#F0784A', text: '#7A5638', sub: '#B49B7E',
    sticker: '#FFD9E0',
    navActive: '#F0784A',
    tint: '#FFF6E8', tintA: 0.00,
    paw: [186,146,106,0.21],
  },
  mint: {
    name: '薄荷奶绿',
    bgTop: '#F4FBF2', bgBottom: '#D8EEDD',
    card: '#FFFFFF', cardSoft: '#F2FAF3',
    pink: '#FFE9DC', yellow: '#FDF6D8', blue: '#DFF0FA', green: '#D8F2D0', purple: '#E6F3E8',
    primary: '#5EBE8A', primary2: '#8CD8AC',
    go: '#5EBE8A', go2: '#96DDB6',
    title: '#3F9E6E', text: '#4E6A54', sub: '#8AA892',
    sticker: '#C9EED8',
    navActive: '#3F9E6E',
    tint: '#A8E8C0', tintA: 0.62,
    paw: [96,166,126,0.20],
  },
  sakura: {
    name: '樱花物语',
    bgTop: '#FDF2F6', bgBottom: '#F6D7E3',
    card: '#FFFFFF', cardSoft: '#FEF3F7',
    pink: '#FFDCE7', yellow: '#FFF0DA', blue: '#E8E6FA', green: '#FDE5EF', purple: '#EFE0F8',
    primary: '#F27BA6', primary2: '#F8A5C2',
    go: '#F27BA6', go2: '#F8AFC8',
    title: '#E0568A', text: '#7C4E5E', sub: '#B08898',
    sticker: '#FFD3E2',
    navActive: '#E0568A',
    tint: '#F5AFC6', tintA: 0.60,
    paw: [212,124,156,0.20],
  },
  ocean: {
    name: '海盐蓝莓',
    bgTop: '#F0F7FD', bgBottom: '#D0E5F5',
    card: '#FFFFFF', cardSoft: '#F0F7FC',
    pink: '#FFE4E0', yellow: '#FFF2D8', blue: '#D6EAFB', green: '#DFF2EA', purple: '#E2E4F9',
    primary: '#5FA8E8', primary2: '#8CC4F0',
    go: '#5FC8A0', go2: '#90DFC2',
    title: '#3E88C8', text: '#46587A', sub: '#8298B4',
    sticker: '#CFE6F8',
    navActive: '#3E88C8',
    tint: '#93BCE6', tintA: 0.72,
    paw: [96,142,196,0.21],
  }
};

var Theme = {
  currentId: function () {
    var t = Save.get('theme');
    return THEMES[t] ? t : 'cream';
  },
  /** 当前主题配色对象 */
  current: function () {
    return THEMES[this.currentId()];
  },
  /** 主题显示名（跟当前语言走；i18n 缺词条时回退中文名） */
  nameOf: function (id) {
    var t = THEMES[id];
    if (!t) return id;
    var key = 'theme' + id.charAt(0).toUpperCase() + id.slice(1);
    try {
      var I = require('./i18n.js');
      var v = I.t(key);
      if (v && v !== key) return v;
    } catch (e) { }
    return t.name;
  },
  /** 全部主题 [{id, name}] */
  list: function () {
    var out = [];
    for (var k in THEMES) out.push({ id: k, name: this.nameOf(k) });
    return out;
  },
  /** 切换主题（持久化） */
  set: function (id) {
    if (THEMES[id]) Save.set('theme', id);
  },
  /** 乘算染色（贴图整体换色用）；返回 null 表示不需要染 */
  tint: function () {
    var t = this.current();
    if (!t.tintA) return null;
    return { color: t.tint, alpha: t.tintA };
  },
  /**
   * 全站统一背景底色：竖向渐变 bgTop → bgBottom。
   * Engine 全局背景与主页背景都走这一份实现，保证一键换肤后底色完全一致。
   * pad：向外多铺的像素（防止震动/偏移时露边）
   */
  paintBg: function (ctx, W, H, pad) {
    var t = this.current();
    var p = pad || 0;
    var g = null;
    try {
      if (ctx && ctx.createLinearGradient) g = ctx.createLinearGradient(0, 0, 0, H);
    } catch (e) { g = null; }
    if (g && g.addColorStop) {
      g.addColorStop(0, t.bgTop);
      g.addColorStop(1, t.bgBottom);
      ctx.fillStyle = g;
    } else {
      // 环境不支持渐变：退回上底色
      ctx.fillStyle = t.bgTop;
    }
    ctx.fillRect(-p, -p, W + p * 2, H + p * 2);
  },
  /** 背景爪印颜色（a 为 0..1 的额外透明度系数，用于呼吸动画） */
  paw: function (a) {
    var p = this.current().paw || [186, 146, 106, 0.16];
    var al = p[3] * (a === undefined ? 1 : a);
    if (al < 0) al = 0;
    return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + al.toFixed(3) + ')';
  },
  /** 背景装饰（爪印气泡）开关 */
  decor: function () { return Save.get('decor') !== false; },
  setDecor: function (on) { Save.set('decor', !!on); }
};

module.exports = Theme;
