/**
 * 底部导航（全站统一，与主页同款）
 *
 * 素材：assets/textures/ui/nav_*.png（从设计稿 navbar 拆出的 6 个图标）
 * 底板与"当前项白色凸起卡"由代码绘制，所以任意页面都能正确高亮当前项。
 *
 * route 是场景注册名（engine.register 的 key），label 是 i18n 词条 key。
 * 注意：两者不能再混用 —— 之前 route 写成 'game'/'room' 而场景叫 play/cats，
 * goto 拿到 undefined 直接抛错，就是底部"小游戏/咪窝"点了没反应的原因。
 */
var D = require('./draw.js');
var Save = require('../core/save.js');
var Theme = require('../core/theme.js');
var I = require('../core/i18n.js');

var IMG = 'assets/textures/ui/';

var TABS = [
  { route: 'home', label: 'home', icon: 'nav_home' },
  { route: 'select', label: 'selTab', icon: 'nav_game' },
  { route: 'cats', label: 'room', icon: 'nav_room' },
  { route: 'shop', label: 'shop', icon: 'nav_shop' },
  { route: 'hospital', label: 'hospital', icon: 'nav_hospital' },
  { route: 'bag', label: 'bag', icon: 'nav_bag' }
];

// 设计稿 navbar 800x164 下各图标的位置（由 .workbuddy/split_nav.py 实测）
var RECT = {
  nav_home: [27, 23, 91, 95],
  nav_game: [156, 31, 91, 78],
  nav_room: [287, 26, 90, 84],
  nav_shop: [424, 23, 80, 88],
  nav_hospital: [558, 27, 77, 85],
  nav_bag: [689, 26, 75, 85]
};
var DES_W = 800, DES_H = 164;

var CC = {
  barRim: 'rgba(228,198,160,0.55)',
  cardRim: '#F6D9A8'
};

var Nav = {
  /** 导航条几何（各页面统一调用，保证底部布局一致） */
  metrics: function (W, H) {
    var s = W / DES_W;
    var h = DES_H * s;
    return { x: 0, y: H - h, w: W, h: h, s: s, slot: W / TABS.length };
  },

  /**
   * 渲染底部导航，返回 6 个命中区 [{route,label,x,y,w,h}]
   * active: 当前页的 route
   */
  render: function (engine, ctx, active) {
    var W = engine.W, H = engine.H;
    var m = this.metrics(W, H);
    var s = m.s, y = m.y;
    var T = Theme.current();

    // 底板：主题浅色圆角条 + 顶部一道亮边 + 淡淡的暖色描边
    ctx.fillStyle = 'rgba(120,90,60,0.10)';
    D.roundRect(ctx, 0, y - 2 * s, W, m.h + 8 * s, 26 * s); ctx.fill();
    ctx.fillStyle = T.bgTop;
    D.roundRect(ctx, 0, y, W, m.h + 10 * s, 24 * s); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    D.roundRect(ctx, 10 * s, y + 3 * s, W - 20 * s, 7 * s, 3.5 * s); ctx.fill();
    ctx.strokeStyle = CC.barRim;
    ctx.lineWidth = 1.4 * s;
    D.roundRect(ctx, 0.7 * s, y + 0.7 * s, W - 1.4 * s, m.h + 8 * s, 24 * s); ctx.stroke();

    var btns = [];
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      var cx = m.slot * (i + 0.5);
      var act = t.route === active;

      // 当前项：白色凸起小卡
      if (act) {
        var cw = Math.min(m.slot * 0.94, 142 * s), chh = 132 * s;
        var cxp = cx - cw / 2, cyp = y + 6 * s;
        ctx.fillStyle = 'rgba(150,110,70,0.13)';
        D.roundRect(ctx, cxp + 1 * s, cyp + 4 * s, cw, chh, 20 * s); ctx.fill();
        ctx.fillStyle = T.card;
        D.roundRect(ctx, cxp, cyp, cw, chh, 20 * s); ctx.fill();
        ctx.strokeStyle = CC.cardRim;
        ctx.lineWidth = 1.6 * s;
        D.roundRect(ctx, cxp, cyp, cw, chh, 20 * s); ctx.stroke();
      }

      // 图标
      var r = RECT[t.icon] || [0, 0, 91, 91];
      var iw = r[2] * s, ih = r[3] * s;
      D.img(ctx, engine, IMG + t.icon + '.png', cx - iw / 2, y + r[1] * s, iw, ih);

      // 文字
      D.label(ctx, I.t(t.label), cx, y + 138 * s, 21 * s, act ? T.navActive : T.sub, {
        stroke: act ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.72)',
        strokeW: 3.4 * s, maxW: m.slot * 0.96
      });

      btns.push({ route: t.route, key: t.route, label: t.label, x: m.slot * i, y: y, w: m.slot, h: m.h });
    }
    return btns;
  },

  /** 顶部资源栏（喵币 + 钻石，图标自绘避免老设备 emoji 缺字） */
  topBar: function (engine, ctx, opts) {
    opts = opts || {};
    var W = engine.W;
    var T = Theme.current();
    Save.load();
    ctx.fillStyle = T.card;
    D.roundRect(ctx, W / 2 - 110, 12, 220, 40, 20);
    ctx.fill();
    // 金币
    ctx.fillStyle = '#f0c060';
    ctx.beginPath(); ctx.arc(W / 2 - 76, 32, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d8a040'; ctx.lineWidth = 2; ctx.stroke();
    D.text(ctx, '' + Save.get('coin'), W / 2 - 34, 32, 17, '#c08a3a', 'left');
    // 钻石
    ctx.fillStyle = '#8ab8e0';
    ctx.beginPath();
    ctx.moveTo(W / 2 + 28, 24); ctx.lineTo(W / 2 + 40, 24); ctx.lineTo(W / 2 + 48, 34);
    ctx.lineTo(W / 2 + 34, 44); ctx.lineTo(W / 2 + 20, 34);
    ctx.closePath(); ctx.fill();
    D.text(ctx, '' + Save.get('diamond'), W / 2 + 56, 32, 17, '#7a9ac0', 'left');
  },

  TABS: TABS
};

module.exports = Nav;
