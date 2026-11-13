/**
 * 主页 · 温馨小屋风格（第二种主页，设置里可切换）
 *
 * 参照分层设计稿 1:1 还原：房间背景 + 顶栏（头像/咪币/设置/礼物）
 * + 猫咪主体（耳/眼/嘴/尾/身部件动画）+ 小游戏大按钮 + 四张入口卡 + 刷新提示条。
 *
 * 猫咪动画：把整猫切成 7 个部件（素材见 assets/textures/home2/cat_parts/，
 * 由 .workbuddy/split_cat_v9.js 生成），运行期用 canvas 变换驱动：
 *   身体 呼吸（挤压拉伸）/ 眼睛 定时眨 / 耳朵 偶发抖动 / 尾巴 绕根部摆动 / 嘴 偶发喵叫
 *   点击猫咪：开心弹跳 + 爱心粒子 + 喵叫
 *
 * 尾巴方案（v11）：body 完整保留原图尾巴，不挖任何洞；tail 是同一段原图裁出的
 * 叠加层，拆成「根部静态片 + 尾部错切摆动片」两段绘制（不动线是整条水平分界线）。
 * 摆幅 5/9 设计像素，错位露出的永远是同色原图毛，因此结构上不可能出现
 * 白色裂痕 / 白爪尖刺 / 灰底平涂块 / 撕裂毛边。
 * 历史教训：v9/v10 把 body 尾巴挖成透明再叠 tail，必然产生一条互补边界，
 * 摆动时露地毯或硬切边；平涂底衬、镜像底衬、椭圆排除右边界都只能遮，不能根治。
 *
 * 素材文字说明：卡片与按钮上的中文标题是素材自带（与设计稿一致）；
 * 咪币数字已抹除，运行期按存档动态绘制。
 */
var D = require('../ui/draw.js');
var Save = require('../core/save.js');
var Theme = require('../core/theme.js');
var I = require('../core/i18n.js');

var DW = 750, DH = 1334;          // 设计稿逻辑分辨率
var IMG = 'assets/textures/home2/';
// 分包下载完成后需要等解码的关键图（背景 / 顶栏 / 入口卡 / 猫咪部件），
// 否则撤加载态的那几帧会缺图。
var PRELOAD = ['bg.jpg', 'avatar.png', 'coinbar.png', 'strip.png', 'paws.png',
  'house_left.png', 'house_right.png', 'yarn.png',
  'btn_settings.png', 'btn_gift.png', 'btn_play.png',
  'card_shop.png', 'card_hosp.png', 'card_room.png', 'card_task.png',
  'cat_parts/body.png', 'cat_parts/tail.png', 'cat_parts/earL.png',
  'cat_parts/earR.png', 'cat_parts/eyeL.png', 'cat_parts/eyeR.png',
  'cat_parts/mouth.png'].map(function (n) { return IMG + n; });
// 布局键 → 素材文件名（不带扩展名）
var FILE = {
  settings: 'btn_settings', gift: 'btn_gift', play: 'btn_play',
  shop: 'card_shop', hosp: 'card_hosp', room: 'card_room', task: 'card_task'
};

// ---- 布局（设计稿坐标 [x, y, w, h]）----
// y 仅作兜底：猫/猫窝/毛线球按背景毛毯锚定、底部按钮按屏幕底边锚定（见 layout），
// 保证任何屏幕比例下都贴地、按钮沉底，与效果图一致。
var DES = {
  avatar: [25, 32, 88, 88],
  coinbar: [140, 42, 190, 58],
  settings: [558, 28, 62, 68],
  gift: [646, 28, 64, 68],
  homeSwitch: [438, 30, 104, 62],
  paws: [588, 148, 100, 96],
  house_left: [-6, 341, 192, 244],
  house_right: [552, 430, 178, 155],
  yarn: [672, 524, 74, 61],
  cat: [181, 182, 388, 508],
  play: [25, 718, 700, 142],
  shop: [25, 874, 340, 216],
  hosp: [385, 874, 340, 216],
  room: [25, 1104, 340, 170],
  task: [385, 1104, 340, 170],
  strip: [255, 1286, 240, 40]
};

// ---- 背景锚定参数（bg.jpg 800x1424 实测）----
// 毛毯顶面后缘/前缘在背景图中的高度比例（墙脚线 37%，框底 55%）；猫脚在顶面深度 74% 处
var BG_W = 800, BG_H = 1424;
var RUG_BACK = 0.40, RUG_FRONT = 0.47, CAT_FEET_AT = 0.72;

// ---- 猫咪部件（cat 设计空间 636x831，坐标来自 cat_parts/parts.json） ----
// 素材管线：.workbuddy/split_cat_v9.js —— body 是完整原图（不挖洞），
// tail/mouth/耳/眼都是同段原图裁出的叠加层；mouth 的 RGB 逐像素等于原图，
// 静止时与 body 严格重合、完全隐形，不做任何压缩/补色。
var CAT_W = 636, CAT_H = 831;
var TAIL_ANCHOR = 118;          // tail 图内静态片/可动片分界（parts.json tailAnchor）
var PART = {
  tail: { x: 0, y: 572, w: 218, h: 250, px: 120, py: 118 },
  earL: { x: 95, y: 0, w: 150, h: 172, px: 81, py: 140 },
  earR: { x: 425, y: 0, w: 196, h: 175, px: 93, py: 142 },
  eyeL: { x: 201, y: 230, w: 116, h: 114, px: 58, py: 57 },
  eyeR: { x: 374, y: 220, w: 120, h: 114, px: 58, py: 57 },
  // v13：rect 四周各留 10px 容纳连续羽化带，轴心 (348,350) 保持不变
  mouth: { x: 286, y: 288, w: 124, h: 116, px: 62, py: 62 }
};

function Home2() { }

Home2.prototype.onShow = function () {
  this.t = 0;
  this.settingsOpen = false;
  this._sickToastDone = false;
  // 分包门闸：home2 资源在分包内，未加载前显示「加载中」
  this._subsReady = false;
  var self = this;
  this.engine.ensureSubs(['home2'], function () {
    // 等关键图 decode 完再撤加载态（1.8s 超时兜底，弱网也不卡住）
    self.engine.waitImages(PRELOAD, function () { self._subsReady = true; }, 1800);
  });
  // 动画状态
  this.blinkT = -1; this.nextBlink = 2.2;
  this.earT = -1; this.earSide = 0; this.nextEar = 4.0;
  this.meowT = -1; this.nextMeow = 6.5;
  this.happyT = -1;
  // 每日奖励由入口 game.js 统一发放并弹窗，主页不再单独发币 / 弹 toast
};

Home2.prototype.update = function (dt) {
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
  // 眨眼：到点触发一次 0.24s 的眨眼
  if (this.blinkT < 0 && this.t > this.nextBlink) { this.blinkT = 0; }
  if (this.blinkT >= 0) {
    this.blinkT += dt;
    if (this.blinkT > 0.24) { this.blinkT = -1; this.nextBlink = this.t + 2.4 + Math.random() * 2.8; }
  }
  // 耳朵抖动：随机一边，0.36s
  if (this.earT < 0 && this.t > this.nextEar) { this.earT = 0; this.earSide = Math.random() < 0.5 ? -1 : 1; }
  if (this.earT >= 0) {
    this.earT += dt;
    if (this.earT > 0.36) { this.earT = -1; this.nextEar = this.t + 3.2 + Math.random() * 3.5; }
  }
  // 喵叫：0.55s 张嘴
  if (this.meowT < 0 && this.t > this.nextMeow) { this.meowT = 0; }
  if (this.meowT >= 0) {
    this.meowT += dt;
    if (this.meowT > 0.55) { this.meowT = -1; this.nextMeow = this.t + 5 + Math.random() * 5; }
  }
  // 开心弹跳（点击互动）：0.6s
  if (this.happyT >= 0) {
    this.happyT += dt;
    if (this.happyT > 0.6) this.happyT = -1;
  }
};

// ---------------- 布局 ----------------
Home2.prototype.layout = function () {
  var W = this.engine.W, H = this.engine.H;
  // 同尺寸只算一次：pos 里的对象被 _allBtns/onTouchDown 持有引用，
  // 每帧重建会把按下状态(_p)冲掉，导致所有按钮点击失效
  var sig = W + 'x' + H;
  if (this._layoutSig === sig && this.pos) return;
  this._layoutSig = sig;

  var topInset = 14;
  try {
    if (typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect) {
      var mb = wx.getMenuButtonBoundingClientRect();
      if (mb && mb.bottom) topInset = mb.bottom + 4;
    }
  } catch (e) { }

  var k = Math.min(W / DW, (H - topInset) / DH);
  this.k = k;
  this.xo = (W - DW * k) / 2;
  this.yo = topInset + Math.max(0, (H - topInset - DH * k)) * 0.5;

  this.pos = {};
  for (var key in DES) {
    var d = DES[key];
    this.pos[key] = {
      key: key,
      x: d[0] * k + this.xo, y: d[1] * k + this.yo,
      w: d[2] * k, h: d[3] * k
    };
  }

  // ---- 背景锚定：bg.jpg 以 cover 铺满屏幕，把毛毯/屏幕底边换算成屏幕坐标 ----
  var bk = Math.max(W / BG_W, H / BG_H);
  var bh = BG_H * bk, bdy = (H - bh) * 0.5;
  var rugBackS = bdy + RUG_BACK * bh;     // 毛毯后缘（屏幕 y）
  var depthS = (RUG_FRONT - RUG_BACK) * bh;

  var P = this.pos;
  // 猫窝/毛线球/猫：站在毛毯上（对照效果图：左窝贴毛毯后缘，右窝更靠后，猫脚在 72% 深度处）
  P.house_left.y = rugBackS + depthS * 0.30 - P.house_left.h;   // 底部沉入毯面，与地毯紧密相接
  // 抵消设计空间居中偏移：DES.house_left.x = -6，但 pos.x 里加了 xo，
  // 短屏（k 由高度决定、xo>0）会把左窝往右带 10~33px，而右窝有 W-w 强制贴边，
  // 造成左右不对称。减去 xo 后左窝始终贴屏幕左边框，保留原本 -6 的轻微出界。
  P.house_left.x -= this.xo;
  P.house_right.y = rugBackS - 0.03 * H - P.house_right.h;
  P.house_right.x = W - P.house_right.w;                        // 右缘紧贴屏幕右边框
  P.yarn.y = rugBackS + depthS * 0.12 - P.yarn.h;
  P.yarn.x = W - P.yarn.w;                                      // 右缘紧贴屏幕右边框
  P.cat.y = rugBackS + CAT_FEET_AT * depthS - P.cat.h;
  // 底部按钮组：锚定屏幕底边、整体上移靠近地毯（底边距 100、间距 16，设计单位）
  P.strip.y = H - 100 * k - P.strip.h;
  P.room.y = P.strip.y - 16 * k - P.room.h;
  P.task.y = P.room.y;
  P.shop.y = P.room.y - 16 * k - P.shop.h;
  P.hosp.y = P.shop.y;
  P.play.y = P.shop.y - 16 * k - P.play.h;

  // 顶栏（头像/咪币/设置/礼物/爪印）整体上移：紧贴胶囊/状态栏下方，消除大块空白
  var topY = topInset + 6;
  var dyT = topY - P.avatar.y;
  var topKeys = ['avatar', 'coinbar', 'settings', 'gift', 'homeSwitch', 'paws'];
  for (var ti = 0; ti < topKeys.length; ti++) P[topKeys[ti]].y += dyT;

  // 设置面板
  var pw = Math.min(W * 0.86, 440);
  var sc = pw / 320;
  this.sc = sc;
  var ph = 300 * sc;
  this.panel = { x: (W - pw) / 2, y: (H - ph) / 2, w: pw, h: ph };
  this.panelClose = { key: 'panelClose', x: this.panel.x + pw - 44 * sc, y: this.panel.y + 8 * sc, w: 36 * sc, h: 30 * sc };
  var lw = (pw - 40 * sc - 8 * sc) / 2;
  this.styleBtns = [
    { key: 'style_classic', x: this.panel.x + 20 * sc, y: this.panel.y + 88 * sc, w: lw, h: 42 * sc },
    { key: 'style_cozy', x: this.panel.x + 28 * sc + lw, y: this.panel.y + 88 * sc, w: lw, h: 42 * sc }
  ];
  this.musicBtn = { key: 'music', x: this.panel.x + 20 * sc, y: this.panel.y + 150 * sc, w: pw - 40 * sc, h: 44 * sc };
  this.langBtns = [
    { key: 'lang_zh', x: this.panel.x + 20 * sc, y: this.panel.y + 232 * sc, w: lw, h: 40 * sc },
    { key: 'lang_en', x: this.panel.x + 28 * sc + lw, y: this.panel.y + 232 * sc, w: lw, h: 40 * sc }
  ];
};

// ---------------- 渲染 ----------------
Home2.prototype.render = function (ctx) {
  this.layout();
  var W = this.engine.W, H = this.engine.H;
  if (!this._subsReady) { this._drawLoading(ctx, W, H); return; }

  // 房间背景：整屏 cover（素材 800x1424）
  if (!this.engine.drawImgCover(ctx, IMG + 'bg.jpg', 0, 0, W, H, 0.5)) {
    Theme.paintBg(ctx, W, H, 0);
  }

  // 摆件装饰（猫窝/毛线球/爪印，随呼吸轻微浮动）
  var bob = Math.sin(this.t * 1.4) * 2 * this.k;
  this._img(ctx, 'house_left', this.pos.house_left);
  this._img(ctx, 'house_right', this.pos.house_right);
  var yarn = this.pos.yarn;
  this._img(ctx, 'yarn', { x: yarn.x, y: yarn.y + bob, w: yarn.w, h: yarn.h });
  ctx.save();
  ctx.globalAlpha = 0.85;
  this._img(ctx, 'paws', this.pos.paws);
  ctx.restore();

  // 主角猫咪（部件动画）
  this._renderCat(ctx);

  // 顶栏
  this._img(ctx, 'avatar', this.pos.avatar);
  this._renderCoin(ctx);
  this._renderSwitch(ctx);
  this._btnImg(ctx, 'settings', this.pos.settings);
  this._btnImg(ctx, 'gift', this.pos.gift);

  // 入口按钮
  this._btnImg(ctx, 'play', this.pos.play);
  this._btnImg(ctx, 'shop', this.pos.shop);
  this._btnImg(ctx, 'hosp', this.pos.hosp);
  this._btnImg(ctx, 'room', this.pos.room);
  this._btnImg(ctx, 'task', this.pos.task);
  this._img(ctx, 'strip', this.pos.strip);

  if (this.settingsOpen) this._renderSettings(ctx, Theme.current());
};

// ---------------- 分包加载态 ----------------
Home2.prototype._drawLoading = function (ctx, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(253,248,236,0.96)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#7A3D18';
  ctx.font = 'bold ' + Math.round(W * 0.052) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var txt = (I.lang && I.lang() === 'en') ? 'Loading…' : '加载中…';
  ctx.fillText(txt, W / 2, H / 2);
  ctx.restore();
};

Home2.prototype._img = function (ctx, name, p) {
  D.img(ctx, this.engine, IMG + (FILE[name] || name) + '.png', p.x, p.y, p.w, p.h);
};

/** 一键切换主页1/主页2 的胶囊按钮（顶栏，设置按钮左侧） */
Home2.prototype._renderSwitch = function (ctx) {
  var p = this.pos.homeSwitch;
  var s = p._p ? 0.94 : 1;
  var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  var x = cx - p.w * s / 2, y = cy - p.h * s / 2, w = p.w * s, h = p.h * s;
  ctx.fillStyle = 'rgba(255,252,244,0.88)';
  D.roundRect(ctx, x, y, w, h, h * 0.42); ctx.fill();
  ctx.strokeStyle = 'rgba(196,142,88,0.55)';
  ctx.lineWidth = Math.max(1, h * 0.055);
  D.roundRect(ctx, x, y, w, h, h * 0.42); ctx.stroke();
  // 图标：两栋小房子 + 来回箭头
  var u = h * 0.30;                       // 基准单位
  var ix = x + w * 0.16, iy = cy - u * 0.55;
  ctx.fillStyle = '#C48E58';
  // 左边小房子
  ctx.beginPath();
  ctx.moveTo(ix, iy + u * 0.9); ctx.lineTo(ix, iy + u * 0.1);
  ctx.lineTo(ix + u * 0.55, iy - u * 0.45); ctx.lineTo(ix + u * 1.1, iy + u * 0.1);
  ctx.lineTo(ix + u * 1.1, iy + u * 0.9); ctx.closePath(); ctx.fill();
  // 右边小房子（更深，表示"另一边"）
  ctx.fillStyle = '#A96F3E';
  ctx.beginPath();
  ctx.moveTo(ix + u * 1.45, iy + u * 0.9); ctx.lineTo(ix + u * 1.45, iy + u * 0.1);
  ctx.lineTo(ix + u * 1.95, iy - u * 0.45); ctx.lineTo(ix + u * 2.45, iy + u * 0.1);
  ctx.lineTo(ix + u * 2.45, iy + u * 0.9); ctx.closePath(); ctx.fill();
  D.text(ctx, I.t('switchHome'), x + w * 0.62, cy, h * 0.34, '#8A5A30');
};

/** 按钮式贴图（按下时 0.94 缩放反馈） */
Home2.prototype._btnImg = function (ctx, name, p) {
  var s = p._p ? 0.94 : 1;
  var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  D.img(ctx, this.engine, IMG + (FILE[name] || name) + '.png',
    cx - p.w * s / 2, cy - p.h * s / 2, p.w * s, p.h * s);
};

/** 咪币胶囊 + 动态余额（素材数字已抹除，位置实测于原图层） */
Home2.prototype._renderCoin = function (ctx) {
  var p = this.pos.coinbar;
  this._img(ctx, 'coinbar', p);
  D.label(ctx, fmt(Save.get('coin')), p.x + p.w * 0.585, p.y + p.h * 0.52, p.h * 0.52, '#FFF5DA', {
    stroke: '#8A4B18', strokeW: p.h * 0.075, maxW: p.w * 0.46
  });
};

// ---------------- 猫咪 ----------------
Home2.prototype._renderCat = function (ctx) {
  var p = this.pos.cat;
  var t = this.t;
  var ks = p.w / CAT_W;                      // 猫设计空间 → 屏幕
  var A = ctx;

  // 呼吸 + 点击弹跳：绕底部中心做挤压拉伸
  var br = 1 + 0.012 * Math.sin(t * 2.6);
  var jumpY = 0, sq = 1;
  if (this.happyT >= 0) {
        var hp = this.happyT / 0.6;            // 0..1
    jumpY = -Math.sin(hp * Math.PI) * 26 * this.k;
    sq = 1 - 0.10 * Math.sin(hp * Math.PI * 2);
  }
  var sy = br * sq, sx = 1 / Math.sqrt(sy);    // 体积守恒，更Q弹

  // 接触阴影：猫脚下的柔边椭圆投影（跳起时缩小+变淡，落地时最实）
  var lift = Math.min(1, Math.abs(jumpY) / (26 * this.k || 1));
  var shW = p.w * (0.56 - 0.14 * lift);
  var shAlpha = 0.32 - 0.16 * lift;
  var shCx = p.x + p.w / 2;
  var shCy = p.y + p.h - p.h * 0.012 + jumpY * 0.22;
  ctx.save();
  ctx.translate(shCx, shCy);
  ctx.scale(1, 0.18);
  var sg = ctx.createRadialGradient(0, 0, shW * 0.15, 0, 0, shW * 0.5);
  sg.addColorStop(0, 'rgba(112,74,38,' + shAlpha.toFixed(3) + ')');
  sg.addColorStop(0.65, 'rgba(112,74,38,' + (shAlpha * 0.45).toFixed(3) + ')');
  sg.addColorStop(1, 'rgba(112,74,38,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(0, 0, shW * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  A.save();
  A.translate(p.x + p.w / 2, p.y + p.h + jumpY);
  A.scale(sx, sy);
  A.translate(-p.w / 2, -p.h);

  // 身体
  this._part(ctx, 'body', 0, 0, CAT_W, CAT_H, 0, 0, 0, ks);

  // 尾巴：根部静态片不动，尾部沿分界线做水平错切摆动（开心时更快更大幅）
  var wagSpeed = this.happyT >= 0 ? 9 : 2.6;
  // body 保留完整原图尾巴，摆幅控制在 5/9：错位时露出的只是同色原图毛边，
  // 不会出现第二条尾巴的重影，更不会露出地毯/补色硬边。
  var wagAmp = this.happyT >= 0 ? 9 : 5;     // 尾尖最大水平位移（cat 设计像素）
  this._partTail(ctx, PART.tail, Math.sin(t * wagSpeed) * wagAmp, ks);

  // 耳朵：偶发快速抖动 + 细微随动
  var angL = 1.2 * Math.sin(t * 1.7) * Math.PI / 180;
  var angR = -1.2 * Math.sin(t * 1.7 + 0.6) * Math.PI / 180;
  if (this.earT >= 0) {
    var ep = this.earT / 0.36;
    var tw = Math.sin(ep * Math.PI * 2) * (1 - ep) * 9 * Math.PI / 180;
    if (this.earSide < 0) angL += tw; else angR += tw;
  }
  if (this.happyT >= 0) { angL -= 0.10; angR += 0.10; }   // 开心时飞机耳
  var el = PART.earL, er = PART.earR;
  this._part(ctx, 'earL', el.x, el.y, el.w, el.h, el.px, el.py, angL, ks);
  this._part(ctx, 'earR', er.x, er.y, er.w, er.h, er.px, er.py, angR, ks);

  // 眼睛：眨眼 = 上眼睑合拢（贴图压扁并淡出，露出 body 预置的闭眼弧线）
  var eyeSy = 1, eyeAlpha = 1;
  if (this.blinkT >= 0) {
    var bp = this.blinkT / 0.24;
    var closed = Math.sin(bp * Math.PI);
    eyeSy = 1 - 0.88 * closed;
    eyeAlpha = 1 - 0.94 * closed;
  }
  var yl = PART.eyeL, yr = PART.eyeR;
  this._partEye(ctx, 'eyeL', yl, eyeSy, ks, 0, eyeAlpha);
  this._partEye(ctx, 'eyeR', yr, eyeSy, ks, 0, eyeAlpha);

  // 嘴巴：喵叫 = 张嘴（纵向拉伸 + 微下移）
  var mSy = 1, mDy = 0;
  if (this.meowT >= 0) {
    var mp = this.meowT / 0.55;
    var open = Math.sin(mp * Math.PI);
    mSy = 1 + 0.38 * open;
    mDy = 5 * open;
  }
  var mo = PART.mouth;
  this._partEye(ctx, 'mouth', mo, mSy, ks, mDy);

  A.restore();
};

/** 普通部件：可选绕轴心旋转（角度 rad），ks 为设计空间缩放 */
Home2.prototype._part = function (ctx, name, x, y, w, h, px, py, ang, ks) {
  var im = this.engine.img(IMG + 'cat_parts/' + name + '.png');
  if (!im) return;
  ctx.save();
  if (ang) {
    ctx.translate((x + px) * ks, (y + py) * ks);
    ctx.rotate(ang);
    ctx.translate(-(x + px) * ks, -(y + py) * ks);
  }
  try { ctx.drawImage(im, x * ks, y * ks, w * ks, h * ks); } catch (e) { }
  ctx.restore();
};

/**
 * 尾巴（v11）：body 完整保留原图尾巴，tail 只作为叠加层做小幅摆动。
 *
 * v9/v10 把 body 的尾巴挖成透明再叠 tail，必然产生一条「挖空边界 ↔ 贴图边界」
 * 的互补缝：摆动时露出的不是地毯就是硬切边，于是反复出现白色裂痕、白爪尖刺、
 * 椭圆凹口弧线。平涂底衬、镜像底衬、逐行钉住右边界都只是遮，边界一动缝就回来。
 *
 * 本版彻底不挖洞：body 是完整原图，tail 是同一段原图裁出的叠加层，
 * 因此任何摆角下露出的都是**同色原图毛**，结构上不可能出现白缝/灰块/补丁。
 * 根部静态片不动、可动片水平错切（不动线是整条水平分界线），保留自然甩动感；
 * 摆幅 5/9 设计像素，错位只有几像素宽的原图毛边，不会形成第二条尾巴重影。
 * amp 为尾尖最大水平位移（cat 设计空间像素）。
 */
Home2.prototype._partTail = function (ctx, def, amp, ks) {
  var im = this.engine.img(IMG + 'cat_parts/tail.png');
  if (!im) return;
  var x = def.x * ks, y = def.y * ks, w = def.w * ks, h = def.h * ks;
  var a = TAIL_ANCHOR * ks;
  var cy = (def.y + def.py) * ks;          // 错切不动线 = 静态/可动分界线
  var sh = amp / Math.max(1, def.h - TAIL_ANCHOR);
  ctx.save();
  // 根部静态片（与 body 同图同位，叠加无差异，保证衔接处永不位移）
  try {
    ctx.drawImage(im, 0, 0, def.w, TAIL_ANCHOR, x, y, w, a);
  } catch (e) { }
  // 可动片：水平错切，越靠尾尖位移越大
  ctx.translate(0, cy);
  ctx.transform(1, 0, sh, 1, 0, 0);
  ctx.translate(0, -cy);
  try {
    ctx.drawImage(im, 0, TAIL_ANCHOR, def.w, def.h - TAIL_ANCHOR,
                  x, y + a, w, h - a);
  } catch (e) { }
  ctx.restore();
};

/** 脸内部件：绕轴心纵向缩放（眨眼/张嘴） */
Home2.prototype._partEye = function (ctx, name, def, sy, ks, dy, alpha) {
  var im = this.engine.img(IMG + 'cat_parts/' + name + '.png');
  if (!im) return;
  ctx.save();
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate((def.x + def.px) * ks, (def.y + def.py + (dy || 0)) * ks);
  ctx.scale(1, sy);
  ctx.translate(-(def.x + def.px) * ks, -(def.y + def.py) * ks);
  try { ctx.drawImage(im, def.x * ks, def.y * ks, def.w * ks, def.h * ks); } catch (e) { }
  ctx.restore();
};

/** 设置面板（主页风格 / 音效 / 语言） */
Home2.prototype._renderSettings = function (ctx, T) {
  var W = this.engine.W, H = this.engine.H;
  var sc = this.sc || 1;
  ctx.fillStyle = 'rgba(90,60,40,0.42)';
  ctx.fillRect(0, 0, W, H);
  var p = this.panel;
  ctx.fillStyle = T.card;
  D.roundRect(ctx, p.x, p.y, p.w, p.h, 24 * sc); ctx.fill();
  D.text(ctx, I.t('setTitle'), p.x + p.w / 2, p.y + 30 * sc, 19 * sc, T.title);

  // 主页风格
  D.text(ctx, I.t('homeStyle'), p.x + 20 * sc, p.y + 66 * sc, 13 * sc, T.text, 'left');
  var cur = Save.get('homeStyle') === 'cozy' ? 'cozy' : 'classic';
  var names = { classic: I.t('styleClassic'), cozy: I.t('styleCozy') };
  for (var i = 0; i < this.styleBtns.length; i++) {
    var b = this.styleBtns[i];
    var id = b.key.slice(6);
    var act = id === cur;
    ctx.fillStyle = act ? T.primary2 : '#F2EDE4';
    D.roundRect(ctx, b.x, b.y, b.w, b.h, 18 * sc); ctx.fill();
    D.text(ctx, names[id], b.x + b.w / 2, b.y + b.h / 2, 14 * sc, act ? '#FFFFFF' : '#9A9088');
  }

  this._toggleRow(ctx, T, this.musicBtn, I.t('music'), Save.get('music') !== false);

  D.text(ctx, I.t('lang'), p.x + 20 * sc, p.y + 218 * sc, 13 * sc, T.text, 'left');
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

Home2.prototype._toggleRow = function (ctx, T, row, label, on) {
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

// ---------------- 触控 ----------------
Home2.prototype._allBtns = function () {
  var p = this.pos;
  var all = [p.settings, p.gift, p.homeSwitch, p.play, p.shop, p.hosp, p.room, p.task, p.cat, p.avatar];
  if (this.settingsOpen)
    all = all.concat(this.styleBtns, [this.panelClose, this.musicBtn], this.langBtns);
  return all;
};

Home2.prototype.onTouchDown = function (x, y) {
  var all = this._allBtns();
  for (var i = 0; i < all.length; i++) all[i]._p = D.hit(all[i], x, y);
};

Home2.prototype.onTouchUp = function (x, y) {
  var all = this._allBtns();
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    var hit = D.hit(b, x, y);   // 不依赖 _p：pos 可能已被 layout 重建
    b._p = false;
    if (!hit) continue;

    if (this.settingsOpen) {
      if (b.key === 'panelClose') { this.settingsOpen = false; }
      else if (b.key === 'style_classic') {
        Save.set('homeStyle', 'classic');
        this.engine.goto('home');
      } else if (b.key === 'style_cozy') {
        Save.set('homeStyle', 'cozy');
        this.engine.toast(I.t('styleOk', { name: I.t('styleCozy') }));
      } else if (b.key === 'music') {
        Save.set('music', Save.get('music') === false);
        this.engine.toast(Save.get('music') !== false ? I.t('on') : I.t('off'));
      } else if (b.key === 'lang_zh' || b.key === 'lang_en') {
        Save.set('lang', b.key.slice(5));
      }
      continue;
    }

    switch (b.key) {
      case 'settings': this.settingsOpen = true; this._panelGuard = true; break;
      case 'homeSwitch': {
        var to = Save.get('homeStyle') === 'cozy' ? 'classic' : 'cozy';
        Save.set('homeStyle', to);
        this.engine.goto('home');
        this.engine.toast(I.t('styleOk', { name: I.t(to === 'cozy' ? 'styleCozy' : 'styleClassic') }));
        break;
      }
      case 'gift': this.engine.goto('task'); break;
      case 'play': this.engine.goto('select'); break;
      case 'shop': this.engine.goto('shop'); break;
      case 'hosp': this.engine.goto('hospital'); break;
      case 'room': this.engine.goto('cats'); break;
      case 'task': this.engine.goto('task'); break;
      case 'avatar':
        this.engine.toast(I.t('catsCount', { n: (Save.get('cats') || []).length }));
        break;
      case 'cat': this._pokeCat(b); break;
    }
  }
  // 点击面板外关闭
  if (this.settingsOpen) {
    if (this._panelGuard) { this._panelGuard = false; }
    else {
      var p = this.panel;
      if (x < p.x || x > p.x + p.w || y < p.y || y > p.y + p.h) this.settingsOpen = false;
    }
  }
};

/** 摸猫：开心弹跳 + 爱心 + 喵叫 */
Home2.prototype._pokeCat = function (b) {
  this.happyT = 0;
  this.meowT = 0;
  this.engine.burst(b.x + b.w / 2, b.y + b.h * 0.3, '#FF8FA3', 8, { star: true, speed: 90, size: 6, life: 0.8, g: 60 });
  this.engine.float(b.x + b.w / 2, b.y + b.h * 0.25, '喵~', '#FF7A94', 24);
  try {
    var A = require('../adapter.js');
    A.beep(880, 0.12, 'sine', 0.14);
    A.beep(1174, 0.16, 'sine', 0.12, 0.1);
  } catch (e) { }
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

module.exports = Home2;
