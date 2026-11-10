/**
 * 主界面 —— 设计稿 1:1 还原（布局重排 + 全文字 i18n）
 *
 * 所有切片里的文字都已在素材阶段抹除（见 .workbuddy/rebuild_textless.py），
 * 运行期用 I.t(key) 重绘，因此换语言不会再出现"图片里的中文"。
 *
 * 设计基准 800x1422：顶栏 / 大卡 / 任务条 / 活动三连 / 2x2 入口卡 / 导航条。
 * 竖向是流式布局：各块高度固定，屏幕富余高度均分到 4 个间隙里。
 */
var D = require('../ui/draw.js');
var Nav = require('../ui/nav.js');
var Decor = require('../ui/decor.js');
var Save = require('../core/save.js');
var Theme = require('../core/theme.js');
var I = require('../core/i18n.js');

var DW = 800;
var IMG = 'assets/textures/home/';

// 设计稿坐标 [x, y, w, h]
var DES = {
  title: [8, 4, 316, 131],      // logo 牌子（按素材原始比例放大，更醒目）
  coin: [332, 30, 204, 71],     // 咪币胶囊
  // 房间大图：素材 hero.png 是 758x495（宽高比 1.531），所以设计高度只能是 496。
  // 之前写 396 会把插画竖向压扁 20%（猫和房间被拉宽），必须按素材真实比例给高。
  hero: [20, 122, 760, 496],
  task: [24, 0, 752, 129],      // 今日任务条（素材 748x129，y 由流式布局算）
  act1: [40, 0, 220, 106],      // 今日签到
  act2: [290, 0, 220, 106],     // 限时活动 1
  act3: [540, 0, 220, 106],     // 限时活动 2
  game: [20, 0, 370, 234],
  room: [410, 0, 370, 234],
  shop: [20, 0, 370, 228],
  hosp: [410, 0, 370, 228],
  // 一键切换主页胶囊（浮在大图右上角：顶栏已被 logo/咪币/三圆钮占满）
  homeSwitch: [636, 134, 124, 52]
};
// 顶栏三个圆钮（等大、同一条水平轴；素材已归一化到 64x64 画布）
var BTN = {
  settings: [552, 24, 66, 66],   // 原"体力"，其实是设置（皮肤/音量/语音）
  mail: [626, 24, 66, 66],
  event: [700, 24, 66, 66]
};
var BTN_CAP_Y = 108;              // 三个按钮文字的共同基线（设计稿）

// 竖向流式布局：内容高度固定，屏幕富余高度均分到 4 个间隙里
var HERO_H = 496, TASK_H = 129, ACT_H = 106, ROW1_H = 234, ROW2_H = 228;
var GAP_BASE = [8, 10, 10, 10];   // 大卡→任务条 / →活动行 / →第一行 / →第二行
var CONTENT_TOP = 122;
var CONTENT_BOTTOM = CONTENT_TOP + HERO_H + TASK_H + ACT_H + ROW1_H + ROW2_H
  + GAP_BASE[0] + GAP_BASE[1] + GAP_BASE[2] + GAP_BASE[3];

var FILE = {
  title: 'title', coin: 'coin_pill',
  settings: 'btn_stamina', mail: 'btn_mail', event: 'btn_event',
  hero: 'hero', task: 'taskbar',
  game: 'card_game', room: 'card_room', shop: 'card_shop', hosp: 'card_hosp'
};

// 配色（取自设计稿实测）
var C = {
  cardTitle: '#E45430', cardTitleRim: '#FFFFFF',
  body: '#6B4A38', subBody: '#9A7A62', rim: '#FFFFFF',
  logoFill: '#FFFFFF', logoRim: '#F0786C', logoKey: '#FFFDF6', logoThick: '#D26850',
  coin: '#622711', coinLabel: '#7A3F14',
  goText: '#FFFFFF',
  actBg: '#FFF9E9', actRim: '#EFD0A4', actTitle: '#7A4A2E', actSub: '#A9856A'
};

function Home() { }

Home.prototype.onShow = function () {
  this.t = 0;
  this.settingsOpen = false;
  this._sickToastDone = false;
  var daily = Save.checkDaily();
  if (daily > 0) this.engine.toast(I.t('dailyReward', { n: daily }));
};

Home.prototype.update = function (dt) {
  this.t += dt;
  this._acc = (this._acc || 0) + dt;
  if (this._acc > 2) {
    this._acc = 0;
    var sick = Save.tickAll();
    if (sick.length && !this._sickToastDone) {
      this._sickToastDone = true;
      this.engine.toast(I.t('sickToast', { name: sick[0].name }));
    }
  }
};

// ---------------- 布局 ----------------
Home.prototype.layout = function () {
  var W = this.engine.W, H = this.engine.H;
  var kw = W / DW;
  // 顶部安全区：让出微信胶囊按钮（+4 是胶囊底部到顶栏之间的留白，别写太大，
  // 否则整页会被顶栏自身的高度差顶得离屏幕上沿很远）
  var topInset = 14 * kw;
  try {
    if (typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect) {
      var mb = wx.getMenuButtonBoundingClientRect();
      if (mb && mb.bottom) topInset = mb.bottom + 4;
    }
  } catch (e) { }

  var nm = Nav.metrics(W, H);
  var navY = nm.y;

  // k 要同时满足三件事：不超出屏宽、整幅设计稿装得下、内容底不压底部导航
  // （平板这类"宽而矮"的比例里，导航条按宽度缩放会变很高，必须用 navY 兜一次）
  var k = Math.min(kw, (H - topInset) / 1422, (navY - topInset) / CONTENT_BOTTOM);
  this.k = k;
  var dy = Math.max(0, topInset - 14 * k);      // 整体下移量

  // 富余高度不要全塞进间隙（那样四个大缝一撑，整页就散）。
  // 先给底部留出 BOTTOM_PAD（不然第二排卡会直接贴住导航），
  // 间隙最多各加 GAP_EXTRA_MAX，剩下的绝大部分留给"导航上方的呼吸区"，
  // 顶栏最多再下移 TOP_EXTRA_MAX —— 顶栏一下移整页都跟着往下跑，
  // 屏幕上沿就会空出一大条（用户反馈"顶层离页面边界太远"就是这个）。
  var GAP_EXTRA_MAX = 12, BOTTOM_PAD = 26, TOP_EXTRA_MAX = 8;
  var leftover = Math.max(0, navY - (CONTENT_BOTTOM * k + dy) - BOTTOM_PAD * k);
  var e1 = Math.min(leftover / 4, GAP_EXTRA_MAX * k);
  var rest = Math.max(0, leftover - e1 * 4);
  dy += Math.min(rest * 0.3, TOP_EXTRA_MAX * k);

  var xo = (W - DW * k) / 2;                     // 左右留白（窄屏居中）
  this.xo = xo;
  this.dy = dy;

  this.pos = {};
  for (var key in DES) {
    var d = DES[key];
    this.pos[key] = { x: d[0] * k + xo, y: d[1] * k + dy, w: d[2] * k, h: d[3] * k };
  }
  for (var b in BTN) {
    var e = BTN[b];
    this.pos[b] = { x: e[0] * k + xo, y: e[1] * k + dy, w: e[2] * k, h: e[3] * k };
  }

  // 竖向：顶栏 → 大卡 → 任务条 → 活动三连 → 两行卡片 → 导航
  var g1 = GAP_BASE[0] * k + e1, g2 = GAP_BASE[1] * k + e1;
  var g3 = GAP_BASE[2] * k + e1, g4 = GAP_BASE[3] * k + e1;

  var hero = this.pos.hero;
  var task = this.pos.task;
  task.y = hero.y + hero.h + g1;

  var actY = task.y + task.h + g2;
  ['act1', 'act2', 'act3'].forEach(function (a) { this.pos[a].y = actY; }, this);

  var row1 = actY + ACT_H * k + g3;
  this.pos.game.y = this.pos.room.y = row1;
  var row2 = row1 + ROW1_H * k + g4;
  this.pos.shop.y = this.pos.hosp.y = row2;

  this.gaps = [g1, g2, g3, g4];

  // 命中区域
  this.hitTitle = this.pos.title;
  this.hitSettings = this.pos.settings;
  this.hitSwitch = { key: 'homeSwitch', x: this.pos.homeSwitch.x, y: this.pos.homeSwitch.y, w: this.pos.homeSwitch.w, h: this.pos.homeSwitch.h };
  this.hitMail = this.pos.mail;
  this.hitEvent = this.pos.event;
  this.hitTask = task;
  this.hitActs = [
    { key: 'checkin', x: this.pos.act1.x, y: this.pos.act1.y, w: this.pos.act1.w, h: this.pos.act1.h },
    { key: 'event1', x: this.pos.act2.x, y: this.pos.act2.y, w: this.pos.act2.w, h: this.pos.act2.h },
    { key: 'event2', x: this.pos.act3.x, y: this.pos.act3.y, w: this.pos.act3.w, h: this.pos.act3.h }
  ];
  this.hitCards = [
    { key: 'play', x: this.pos.game.x, y: this.pos.game.y, w: this.pos.game.w, h: this.pos.game.h },
    { key: 'cats', x: this.pos.room.x, y: this.pos.room.y, w: this.pos.room.w, h: this.pos.room.h },
    { key: 'shop', x: this.pos.shop.x, y: this.pos.shop.y, w: this.pos.shop.w, h: this.pos.shop.h },
    { key: 'hospital', x: this.pos.hosp.x, y: this.pos.hosp.y, w: this.pos.hosp.w, h: this.pos.hosp.h }
  ];
  this.hitNav = [];
  var slot = nm.slot;
  for (var i = 0; i < Nav.TABS.length; i++)
    this.hitNav.push({ route: Nav.TABS[i].route, key: Nav.TABS[i].route, x: slot * i, y: navY, w: slot, h: nm.h });

  // 设置面板：整体按屏宽缩放（sc = 面板宽/320），大屏字号才不会缩成蚂蚁
  var pw = Math.min(W * 0.86, 440);
  var sc = pw / 320;
  this.sc = sc;
  var ph = 456 * sc;
  this.panel = { x: (W - pw) / 2, y: (H - ph) / 2, w: pw, h: ph };
  this.panelClose = { key: 'panelClose', x: this.panel.x + pw - 44 * sc, y: this.panel.y + 8 * sc, w: 36 * sc, h: 30 * sc };
  this.themeBtns = [];
  var tw = (pw - 40 * sc - 24 * sc) / 4;
  for (var t = 0; t < 4; t++) {
    this.themeBtns.push({
      idx: t,
      x: this.panel.x + 20 * sc + t * (tw + 8 * sc),
      y: this.panel.y + 92 * sc,
      w: tw, h: 84 * sc
    });
  }
  this.musicBtn = { key: 'music', x: this.panel.x + 20 * sc, y: this.panel.y + 200 * sc, w: pw - 40 * sc, h: 44 * sc };
  this.decorBtn = { key: 'decor', x: this.panel.x + 20 * sc, y: this.panel.y + 254 * sc, w: pw - 40 * sc, h: 44 * sc };
  var lw = (pw - 40 * sc - 8 * sc) / 2;
  this.styleBtns = [
    { key: 'style_classic', x: this.panel.x + 20 * sc, y: this.panel.y + 322 * sc, w: lw, h: 40 * sc },
    { key: 'style_cozy', x: this.panel.x + 28 * sc + lw, y: this.panel.y + 322 * sc, w: lw, h: 40 * sc }
  ];
  this.langBtns = [
    { key: 'lang_zh', x: this.panel.x + 20 * sc, y: this.panel.y + 392 * sc, w: lw, h: 40 * sc },
    { key: 'lang_en', x: this.panel.x + 28 * sc + lw, y: this.panel.y + 392 * sc, w: lw, h: 40 * sc }
  ];
};

// ---------------- 渲染 ----------------
Home.prototype.render = function (ctx) {
  this.layout();
  var W = this.engine.W, H = this.engine.H;
  var k = this.k;

  // 背景底色：与背包页/全站共用同一套主题渐变，一键换肤后整体风格完全统一
  Theme.paintBg(ctx, W, H, 0);

  this._slice(ctx, 'hero');
  this._slice(ctx, 'task');

  this._renderActs(ctx);
  this._slice(ctx, 'game');
  this._slice(ctx, 'room');
  this._slice(ctx, 'shop');
  this._slice(ctx, 'hosp');

  this._slice(ctx, 'title');
  this._slice(ctx, 'coin');
  this._slice(ctx, 'settings');
  this._slice(ctx, 'mail');
  this._slice(ctx, 'event');

  // 背景爪印（可动）：压在贴图之上、文字之下，卡片与插画上淡淡的一层
  Decor.paws(ctx, W, H, this.t, 1);

  // 底部导航：全站统一样式（自带主题配色）
  Nav.render(this.engine, ctx, 'home');

  this._renderTitle(ctx);
  this._renderCoin(ctx);
  this._renderTopButtons(ctx);
  this._renderSwitch(ctx);
  this._renderTask(ctx);
  this._renderCards(ctx);

  var ar = this.engine.atlasReady ? this.engine.atlasReady() : { cat: true, icon: true };
  if (!ar.cat || !ar.icon) {
    D.text(ctx, I.t('atlasMiss'), W / 2, 70, 11, '#e06060');
  }

  if (this.settingsOpen) this._renderSettings(ctx, Theme.current());
};

/** 按设计坐标画一张切片 */
Home.prototype._slice = function (ctx, key) {
  var p = this.pos[key];
  this._drawAt(ctx, key, p.x, p.y, p.w, p.h);
};

Home.prototype._drawAt = function (ctx, key, x, y, w, h) {
  D.img(ctx, this.engine, IMG + (FILE[key] || key) + '.png', x, y, w, h);
};

// ---- 顶栏：logo / 咪币 / 三个按钮 ----
Home.prototype._renderTitle = function (ctx) {
  var p = this.pos.title, k = this.k;
  var txt = I.t('appName');
  // 英文名只有 4 个字母，字号要放大才撑得住牌子；中文 4 字本身够宽，只拉开字距
  var isEn = I.lang() === 'en';
  var sp = (isEn ? 3 : 6) * k;
  var size = (isEn ? 72 : 52) * k;
  var cx = p.x + p.w * 0.5, cy = p.y + p.h * 0.44;
  var maxW = p.w * 0.78 - sp * Math.max(0, txt.length - 1);

  // 贴纸厚度：只描边不填充、整体下移，形成牌子的立体感
  D.label(ctx, txt, cx, cy + 4.5 * k, size, C.logoThick, {
    font: D.FONT_ROUND, spacing: sp, maxW: maxW,
    stroke: C.logoThick, strokeW: 18 * k, fill: false
  });
  // 字芯：白字 + 橙红中描 + 奶油外描
  D.label(ctx, txt, cx, cy, size, C.logoFill, {
    font: D.FONT_ROUND, spacing: sp, maxW: maxW,
    stroke: C.logoRim, strokeW: 10 * k,
    outer: C.logoKey, outerW: 17 * k
  });
};

Home.prototype._renderCoin = function (ctx) {
  var p = this.pos.coin, k = this.k;
  // 金币徽章上的币种小字（素材实测：徽章中心在 13.5% / 38.5% 处）
  D.label(ctx, I.t('coinLabel'), p.x + p.w * 0.135, p.y + p.h * 0.385, 18 * k, C.coinLabel, {
    maxW: p.w * 0.22
  });
  // 余额（千分位）
  D.label(ctx, fmt(Save.get('coin')), p.x + p.w * 0.585, p.y + p.h * 0.545, 32 * k, C.coin, {
    maxW: p.w * 0.43
  });
  // 徽章下方橙色小标签上的体力
  var st = Save.get('stamina');
  if (st === undefined || st === null) st = 5;
  D.label(ctx, st + '/5', p.x + p.w * 0.155, p.y + p.h * 0.775, 15 * k, '#FFFFFF', {
    stroke: 'rgba(214,120,20,0.6)', strokeW: 3 * k, maxW: p.w * 0.20
  });
};

Home.prototype._renderTopButtons = function (ctx) {
  var k = this.k;
  var capY = BTN_CAP_Y * k + this.pos.settings.y - BTN.settings[1] * k;
  var list = [
    [this.pos.settings, I.t('settings')],
    [this.pos.mail, I.t('mailLabel')],
    [this.pos.event, I.t('eventLabel')]
  ];
  for (var i = 0; i < list.length; i++) {
    var b = list[i][0];
    D.label(ctx, list[i][1], b.x + b.w / 2, capY, 19 * k, C.body, {
      stroke: C.rim, strokeW: 3.6 * k, maxW: b.w * 1.5
    });
  }
};

/** 一键切换主页1/主页2 的胶囊按钮（浮在大图右上角，样式与主页2 顶栏一致） */
Home.prototype._renderSwitch = function (ctx) {
  var p = this.pos.homeSwitch;
  var s = this.hitSwitch._p ? 0.94 : 1;
  var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  var x = cx - p.w * s / 2, y = cy - p.h * s / 2, w = p.w * s, h = p.h * s;
  ctx.fillStyle = 'rgba(255,252,244,0.88)';
  D.roundRect(ctx, x, y, w, h, h * 0.42); ctx.fill();
  ctx.strokeStyle = 'rgba(196,142,88,0.55)';
  ctx.lineWidth = Math.max(1, h * 0.055);
  D.roundRect(ctx, x, y, w, h, h * 0.42); ctx.stroke();
  // 图标：两栋小房子
  var u = h * 0.30;
  var ix = x + w * 0.13, iy = cy - u * 0.55;
  ctx.fillStyle = '#C48E58';
  ctx.beginPath();
  ctx.moveTo(ix, iy + u * 0.9); ctx.lineTo(ix, iy + u * 0.1);
  ctx.lineTo(ix + u * 0.55, iy - u * 0.45); ctx.lineTo(ix + u * 1.1, iy + u * 0.1);
  ctx.lineTo(ix + u * 1.1, iy + u * 0.9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#A96F3E';
  ctx.beginPath();
  ctx.moveTo(ix + u * 1.45, iy + u * 0.9); ctx.lineTo(ix + u * 1.45, iy + u * 0.1);
  ctx.lineTo(ix + u * 1.95, iy - u * 0.45); ctx.lineTo(ix + u * 2.45, iy + u * 0.1);
  ctx.lineTo(ix + u * 2.45, iy + u * 0.9); ctx.closePath(); ctx.fill();
  D.text(ctx, I.t('switchHome'), x + w * 0.64, cy, h * 0.34, '#8A5A30');
};

// ---- 今日任务条 ----
// 切片 748x129（已去掉"新手福利"页签）：粉色标签 x1..162 / y15..105，
// 猫头 y53..110，"去完成"胶囊 x533..722 / y23..103。坐标按原图层实测。
var TB_W = 748;
Home.prototype._renderTask = function (ctx) {
  var p = this.pos.task, k = this.k;
  var fx = p.w / TB_W;                 // 素材横向单位（≈k）

  D.label(ctx, I.t('taskLabel'), p.x + 100 * fx, p.y + 32 * k, 24 * k, C.body, {
    stroke: C.rim, strokeW: 4 * k, maxW: 130 * fx
  });

  D.label(ctx, I.t('taskText'), p.x + 328 * fx, p.y + 65 * k, 34 * k, C.body, {
    stroke: C.rim, strokeW: 5 * k, maxW: 330 * fx
  });

  // "去完成"胶囊（素材里已抹掉，这里重绘：暖白描边 + 橙黄渐变 + 高光）
  var bx = p.x + 533 * fx, by = p.y + 23 * k;
  var bw = 189 * fx, bh = 80 * k;
  D.pill(ctx, bx, by, bw, bh, '#FCD98C', '#F2853C', '#FFFDF6', bh * 0.34);
  D.label(ctx, I.t('go'), bx + bw / 2, by + bh / 2, 36 * k, C.goText, {
    stroke: 'rgba(196,108,34,0.45)', strokeW: 2.4 * k, maxW: bw * 0.80
  });

  // 胶囊下方小字
  D.label(ctx, I.t('levelTag'), bx + bw / 2, p.y + 114 * k, 16 * k, C.subBody, {
    maxW: bw * 0.9
  });
};

// ---- 活动三连（今日签到 / 限时活动 1 / 限时活动 2）----
var ACT_ICON = ['box', 'hammer', 'candy'];
var ACT_CHECKIN_COIN = 100;   // 今日签到奖励
Home.prototype._renderActs = function (ctx) {
  var k = this.k;
  var list = [
    [this.pos.act1, 'actCheckIn', 'actCheckInSub', 0],
    [this.pos.act2, 'actEvent1', 'actEvent1Sub', 1],
    [this.pos.act3, 'actEvent2', 'actEvent2Sub', 2]
  ];
  for (var i = 0; i < list.length; i++) {
    var p = list[i][0];
    var r = 22 * k;
    // 卡底：奶油 + 暖色描边 + 轻投影
    ctx.fillStyle = 'rgba(150,110,70,0.10)';
    D.roundRect(ctx, p.x + 1 * k, p.y + 3 * k, p.w, p.h, r); ctx.fill();
    ctx.fillStyle = C.actBg;
    D.roundRect(ctx, p.x, p.y, p.w, p.h, r); ctx.fill();
    ctx.strokeStyle = C.actRim;
    ctx.lineWidth = 1.6 * k;
    D.roundRect(ctx, p.x, p.y, p.w, p.h, r); ctx.stroke();

    // 左侧圆形图标底
    var cr = p.h * 0.30, cx = p.x + p.h * 0.52, cy = p.y + p.h * 0.5;
    ctx.fillStyle = 'rgba(255,226,180,0.85)';
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();

    // 图标
    var im = this.engine.img('assets/textures/task/' + ACT_ICON[i] + '.png');
    if (im) {
      var s = Math.min(cr * 1.32 / im.width, cr * 1.32 / im.height);
      var iw = im.width * s, ih = im.height * s;
      try { ctx.drawImage(im, cx - iw / 2, cy - ih / 2, iw, ih); } catch (e) { }
    }

    var tx = p.x + p.h * 1.02;
    D.label(ctx, I.t(list[i][1]), tx, p.y + p.h * 0.38, 25 * k, C.actTitle, {
      align: 'left', stroke: 'rgba(255,255,255,0.85)', strokeW: 3 * k, maxW: p.w - p.h * 1.10
    });
    D.label(ctx, I.t(list[i][2], { n: ACT_CHECKIN_COIN }), tx, p.y + p.h * 0.70, 17 * k, C.actSub, {
      align: 'left', maxW: p.w - p.h * 1.10
    });
  }
};

// ---- 四张入口卡 ----
Home.prototype._renderCards = function (ctx) {
  var cards = [
    [this.pos.game, 'cardGame', 'cardGameSub'],
    [this.pos.room, 'cardRoom', 'cardRoomSub'],
    [this.pos.shop, 'cardShop', 'cardShopSub'],
    [this.pos.hosp, 'cardHosp', 'cardHospSub']
  ];
  // 四张卡共用同一套字号：取"缩得最狠"的那个，换语言时标题也不会大小不一
  var tSize = 1e9, sSize = 1e9, i, p;
  for (i = 0; i < cards.length; i++) {
    p = cards[i][0];
    tSize = Math.min(tSize, D.fit(I.t(cards[i][1]), p.h * 0.245, p.w * 0.47));
    sSize = Math.min(sSize, D.fit(I.t(cards[i][2]), p.h * 0.098, p.w * 0.50));
  }
  for (i = 0; i < cards.length; i++) {
    p = cards[i][0];
    D.label(ctx, I.t(cards[i][1]), p.x + p.w * 0.085, p.y + p.h * 0.215, tSize, C.cardTitle, {
      align: 'left', stroke: C.cardTitleRim, strokeW: p.h * 0.042, maxW: p.w * 0.47
    });
    D.label(ctx, I.t(cards[i][2]), p.x + p.w * 0.083, p.y + p.h * 0.425, sSize, C.body, {
      align: 'left', stroke: C.rim, strokeW: p.h * 0.018, maxW: p.w * 0.50
    });
  }
};

/** 金额千分位 */
function fmt(n) {
  var s = '' + (n | 0);
  var out = '';
  for (var i = 0; i < s.length; i++) {
    if (i && (s.length - i) % 3 === 0) out += ',';
    out += s.charAt(i);
  }
  return out;
}

/** 设置面板 */
Home.prototype._renderSettings = function (ctx, T) {
  var W = this.engine.W, H = this.engine.H;
  var sc = this.sc || 1;
  ctx.fillStyle = 'rgba(90,60,40,0.42)';
  ctx.fillRect(0, 0, W, H);
  var p = this.panel;
  ctx.fillStyle = T.card;
  D.roundRect(ctx, p.x, p.y, p.w, p.h, 24 * sc); ctx.fill();
  D.text(ctx, I.t('setTitle'), p.x + p.w / 2, p.y + 30 * sc, 19 * sc, T.title);

  D.text(ctx, I.t('skinTitle'), p.x + 20 * sc, p.y + 66 * sc, 13 * sc, T.text, 'left');
  var themes = Theme.list();
  var cur = Theme.currentId();
  for (var i = 0; i < this.themeBtns.length; i++) {
    var b = this.themeBtns[i];
    var th = themes[i];
    var act = th.id === cur;
    ctx.fillStyle = act ? T.cardSoft : '#FAFAFA';
    D.roundRect(ctx, b.x, b.y, b.w, b.h, 14 * sc); ctx.fill();
    ctx.strokeStyle = act ? T.primary : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = act ? 2.5 * sc : sc;
    ctx.stroke();
    var cols = this._themeSample(th.id);
    for (var c = 0; c < 3; c++) {
      ctx.fillStyle = cols[c];
      ctx.beginPath(); ctx.arc(b.x + b.w / 2 - 13 * sc + c * 13 * sc, b.y + 24 * sc, 6 * sc, 0, Math.PI * 2); ctx.fill();
    }
    D.text(ctx, th.name, b.x + b.w / 2, b.y + 50 * sc, 11.5 * sc, T.text);
    if (act) D.text(ctx, '✓', b.x + b.w / 2, b.y + 70 * sc, 12 * sc, T.primary);
  }

  this._toggleRow(ctx, T, this.musicBtn, I.t('music'), Save.get('music') !== false);
  this._toggleRow(ctx, T, this.decorBtn, I.t('decor'), Theme.decor());

  D.text(ctx, I.t('homeStyle'), p.x + 20 * sc, p.y + 310 * sc, 13 * sc, T.text, 'left');
  var curStyle = Save.get('homeStyle') === 'cozy' ? 'cozy' : 'classic';
  var styleNames = { classic: I.t('styleClassic'), cozy: I.t('styleCozy') };
  for (var s = 0; s < this.styleBtns.length; s++) {
    var sb = this.styleBtns[s];
    var sAct = sb.key === 'style_' + curStyle;
    ctx.fillStyle = sAct ? T.primary2 : '#F2EDE4';
    D.roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 18 * sc); ctx.fill();
    D.text(ctx, styleNames[sb.key.slice(6)], sb.x + sb.w / 2, sb.y + sb.h / 2, 14 * sc, sAct ? '#FFFFFF' : '#9A9088');
  }

  D.text(ctx, I.t('lang'), p.x + 20 * sc, p.y + 380 * sc, 13 * sc, T.text, 'left');
  var langs = [['lang_zh', '中文'], ['lang_en', 'English']];
  var curLang = I.lang();
  for (var l = 0; l < this.langBtns.length; l++) {
    var lb = this.langBtns[l];
    var lAct = lb.key === 'lang_' + curLang;
    ctx.fillStyle = lAct ? T.primary2 : '#F2EDE4';
    D.roundRect(ctx, lb.x, lb.y, lb.w, lb.h, 18 * sc); ctx.fill();
    D.text(ctx, langs[l][1], lb.x + lb.w / 2, lb.y + lb.h / 2, 14 * sc, lAct ? '#FFFFFF' : '#9A9088');
  }

  var cb = this.panelClose;
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  D.roundRect(ctx, cb.x, cb.y, cb.w, cb.h, 15 * sc); ctx.fill();
  D.text(ctx, '×', cb.x + cb.w / 2, cb.y + cb.h / 2, 18 * sc, T.sub);
};

Home.prototype._toggleRow = function (ctx, T, row, label, on) {
  var sc = this.sc || 1;
  ctx.fillStyle = T.cardSoft;
  D.roundRect(ctx, row.x, row.y, row.w, row.h, 18 * sc); ctx.fill();
  D.text(ctx, label, row.x + 16 * sc, row.y + row.h / 2, 14 * sc, T.text, 'left');
  ctx.fillStyle = on ? T.go : '#D8D0C4';
  D.roundRect(ctx, row.x + row.w - 58 * sc, row.y + 9 * sc, 44 * sc, row.h - 18 * sc, 13 * sc); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(row.x + row.w - 58 * sc + (on ? 31 : 13) * sc, row.y + row.h / 2, 9 * sc, 0, Math.PI * 2);
  ctx.fill();
};

Home.prototype._themeSample = function (id) {
  var map = {
    cream: ['#FDF8EC', '#FF9A62', '#FFE4EA'],
    mint: ['#F4FBF2', '#5EBE8A', '#D8F2D0'],
    sakura: ['#FDF2F6', '#F27BA6', '#FFDCE7'],
    ocean: ['#F0F7FD', '#5FA8E8', '#D6EAFB']
  };
  return map[id] || map.cream;
};

// ---------------- 触控 ----------------
Home.prototype._allBtns = function () {
  var all = [this.hitTitle, this.hitSettings, this.hitMail, this.hitEvent, this.hitTask, this.hitSwitch]
    .concat(this.hitActs, this.hitCards, this.hitNav);
  if (this.settingsOpen) all = all.concat(this.themeBtns, [this.panelClose, this.musicBtn, this.decorBtn], this.styleBtns, this.langBtns);
  return all;
};

Home.prototype.onTouchDown = function (x, y) {
  var all = this._allBtns();
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    if (b.key || b.idx !== undefined) b._p = D.hit(b, x, y);
  }
};

Home.prototype.onTouchUp = function (x, y) {
  var all = this._allBtns();
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    b._p = false;
    if (!D.hit(b, x, y)) continue;
    if (this.settingsOpen) {
      if (b.key === 'panelClose') { this.settingsOpen = false; }
      else if (b.idx !== undefined) {
        var th = Theme.list()[b.idx];
        Theme.set(th.id);
        this.engine.toast(I.t('skinOk', { name: th.name }));
      } else if (b.key === 'music') {
        Save.set('music', Save.get('music') === false);
        this.engine.toast(Save.get('music') !== false ? I.t('on') : I.t('off'));
      } else if (b.key === 'decor') {
        Theme.setDecor(!Theme.decor());
      } else if (b.key === 'style_classic') {
        Save.set('homeStyle', 'classic');
        this.engine.toast(I.t('styleOk', { name: I.t('styleClassic') }));
      } else if (b.key === 'style_cozy') {
        Save.set('homeStyle', 'cozy');
        this.engine.goto('home2');
      } else if (b.key === 'lang_zh' || b.key === 'lang_en') {
        Save.set('lang', b.key.slice(5));
      }
      continue;
    }
    if (b === this.hitTitle) { this.settingsOpen = true; this._panelGuard = true; }
    else if (b === this.hitSettings) { this.settingsOpen = true; this._panelGuard = true; }
    else if (b.key === 'homeSwitch') {
      var to = Save.get('homeStyle') === 'cozy' ? 'classic' : 'cozy';
      Save.set('homeStyle', to);
      this.engine.goto('home');
      this.engine.toast(I.t('styleOk', { name: I.t(to === 'cozy' ? 'styleCozy' : 'styleClassic') }));
    }
    else if (b === this.hitMail) { this.engine.toast(I.t('mailTip')); }
    else if (b === this.hitEvent) { this.engine.toast(I.t('eventTip')); }
    else if (b === this.hitTask) { this.engine.goto('task'); }
    else if (b.key === 'checkin') { this.engine.goto('task'); }
    else if (b.key === 'event1' || b.key === 'event2') { this.engine.toast(I.t('eventSoon')); }
    else if (b.key === 'play') { this.engine.goto('play', { level: Save.get('maxLevel') }); }
    else if (b.key && b.key !== 'home') { this.engine.goto(b.key); }
  }
  if (this.settingsOpen) {
    if (this._panelGuard) { this._panelGuard = false; }
    else {
      var p = this.panel;
      if (x < p.x || x > p.x + p.w || y < p.y || y > p.y + p.h) this.settingsOpen = false;
    }
  }
};

module.exports = Home;
