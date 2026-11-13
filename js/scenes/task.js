/**
 * 今日任务页（按设计稿 task-ref 还原）
 *
 * 结构：
 *   返回 / 标题胶囊（左宝箱·右铃铛，左右对称）/
 *   4 条胶囊任务卡（猫头 · 标题+副标题 · 进度 · 奖励）/
 *   底部第一排：灰猫 · 黑猫 · 铁锤 · 限时挑战（等大四等分）/
 *   底部第二排：糖果 · 领取奖励 · 周末礼盒（等距三段）
 *
 * 所有文案走 i18n，进度来自 core/tasks.js（跨天重置）。
 */
var D = require('../ui/draw.js');
var Nav = require('../ui/nav.js');
var I = require('../core/i18n.js');
var Decor = require('../ui/decor.js');
var Theme = require('../core/theme.js');
var Tasks = require('../core/tasks.js');

var DW = 800;
var IMG = 'assets/textures/task/';

// ---- 设计稿坐标（800 宽基准，单位：设计像素）----
var HEAD = {
  back: [14, 20, 48, 48],
  pill: [230, 64, 340, 88],
  box: [120, 78, 62, 60],
  bell: [618, 78, 62, 60]
};

var ROW_X = 30, ROW_W = 740, ROW_H = 152, ROW_GAP = 22, ROW_TOP = 190;

// 底部第一排：四个等宽 slot（内容宽度 740 四等分）
var A_Y = 884, A_SLOT = (ROW_W) / 4, A_BOX = 132;
// 底部第二排
var B_Y = 1060, B_H = 88;
var B_CANDY_W = 108, B_CANDY_H = 92;
var B_CTA_W = 340, B_CTA_H = 88;
var B_GIFT_W = 68, B_GIFT_H = 66;
// 三段的中心（内容宽度 30..770 上的百分比）
var B_C1 = 0.14, B_C2 = 0.50, B_C3 = 0.86;

var CONTENT_BOTTOM = 1168;

var C = {
  title: '#7A4A32',
  card: '#FFFBF0', rim: '#C98A5A', shadow: 'rgba(150,96,58,0.18)',
  sub: '#9A6B4A',
  progress: '#C0754A', progressDone: '#D9762F',
  cta1: '#FFE3A0', cta2: '#F5A94B', ctaText: '#7A3F14'
};

function TaskScene() { }

TaskScene.prototype.onShow = function () {
  this.t = 0;
  this._flash = 0;
};

TaskScene.prototype.update = function (dt) {
  this.t += dt;
  if (this._flash > 0) this._flash -= dt;
};

// ---------------- 布局 ----------------
TaskScene.prototype.layout = function () {
  var W = this.engine.W, H = this.engine.H;
  var kw = W / DW;
  var topInset = 14 * kw;
  try {
    if (typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect) {
      var mb = wx.getMenuButtonBoundingClientRect();
      if (mb && mb.bottom) topInset = mb.bottom + 6;
    }
  } catch (e) { }

  var nm = Nav.metrics(W, H);
  var navTop = nm.y;
  // 整页高度 = 顶部条 + 4 行 + 底部两排
  var k = Math.min(kw, (navTop - topInset) / (CONTENT_BOTTOM + 10));
  this.k = k;
  var dy = Math.max(0, topInset - 20 * k);
  var xo = (W - DW * k) / 2;
  this.xo = xo;

  function box(d) {
    return { x: d[0] * k + xo, y: d[1] * k + dy, w: d[2] * k, h: d[3] * k };
  }

  this.pos = {};
  for (var key in HEAD) this.pos[key] = box(HEAD[key]);

  // 4 条任务行
  this.rows = [];
  for (var i = 0; i < 4; i++) {
    this.rows.push({
      idx: i,
      item: Tasks.LIST[i],
      box: box([ROW_X, ROW_TOP + i * (ROW_H + ROW_GAP), ROW_W, ROW_H])
    });
  }

  // 底部两排：在任务行与导航之间居中
  var listBottom = this.rows[3].box.y + this.rows[3].box.h;
  var blockH = (B_Y + B_H + 30 - A_Y) * k;
  var avail = Math.max(0, navTop - listBottom);
  var aTop = listBottom + Math.max(8 * k, (avail - blockH) / 2);

  // 第一排四个 slot（等宽、内容居中）
  this.slots = [];
  var slotW = A_SLOT * k;
  for (var s = 0; s < 4; s++) {
    var cx = (ROW_X + A_SLOT * s) * k + xo + slotW / 2;
    this.slots.push({
      idx: s,
      cx: cx,
      x: cx - A_BOX * k / 2,
      y: aTop + (A_SLOT * 0.06) * k,
      w: A_BOX * k,
      h: A_BOX * k
    });
  }
  var p = this.pos;
  p.candy = {
    x: (ROW_X + ROW_W * B_C1) * k + xo - B_CANDY_W * k / 2,
    y: aTop + (B_Y - A_Y) * k,
    w: B_CANDY_W * k, h: B_CANDY_H * k
  };
  p.cta = {
    x: (ROW_X + ROW_W * B_C2) * k + xo - B_CTA_W * k / 2,
    y: aTop + (B_Y - A_Y) * k,
    w: B_CTA_W * k, h: B_CTA_H * k
  };
  p.gift = {
    x: (ROW_X + ROW_W * B_C3) * k + xo - B_GIFT_W * k / 2,
    y: aTop + (B_Y - A_Y) * k + (B_CTA_H - B_GIFT_H) * k / 2,
    w: B_GIFT_W * k, h: B_GIFT_H * k
  };

  // 命中区
  this.hitBack = p.back;
  this.hitLimit = this.slots[3];
  this.hitCandy = p.candy;
  this.hitCta = p.cta;
  this.hitGift = { x: p.gift.x - 10 * k, y: p.gift.y, w: p.gift.w + 20 * k, h: p.gift.h + 34 * k };
  this.hitChips = [this.slots[0], this.slots[1], this.slots[2]];
};

// ---------------- 渲染 ----------------
TaskScene.prototype.render = function (ctx) {
  this.layout();
  var W = this.engine.W, H = this.engine.H;

  // 背景底色：与主页/背包共用同一套主题渐变，一键换肤后全站统一
  Theme.paintBg(ctx, W, H, 0);
  // 背景爪印（可动）：底图之上、卡片之下
  Decor.paws(ctx, W, H, this.t, 6);

  this._renderHeader(ctx);
  for (var i = 0; i < this.rows.length; i++) this._renderRow(ctx, this.rows[i]);
  this._renderBottom(ctx);
  Nav.render(this.engine, ctx, 'home');
};

TaskScene.prototype._img = function (ctx, name, x, y, w, h) {
  return D.img(ctx, this.engine, IMG + name + '.png', x, y, w, h);
};

TaskScene.prototype._renderHeader = function (ctx) {
  var k = this.k, p = this.pos;

  // 返回
  var b = p.back;
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  D.roundRect(ctx, b.x, b.y, b.w, b.h, b.w / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(214,170,120,0.65)';
  ctx.lineWidth = 1.6 * k;
  D.roundRect(ctx, b.x, b.y, b.w, b.h, b.w / 2); ctx.stroke();
  D.label(ctx, '‹', b.x + b.w / 2, b.y + b.h * 0.44, b.h * 0.72, '#8A5B3E', { strokeW: 0 });

  // 标题胶囊（居中）
  var t = p.pill;
  D.pill(ctx, t.x, t.y, t.w, t.h, '#FFE3A8', '#F5A94B', '#FFF6DF', t.h * 0.5);
  D.label(ctx, I.t('taskPageTitle'), t.x + t.w / 2, t.y + t.h * 0.53, t.h * 0.50, C.title, {
    stroke: 'rgba(255,247,231,0.85)', strokeW: 5 * k, maxW: t.w * 0.80
  });

  // 两侧小装饰：与胶囊同轴、左右对称
  this._img(ctx, 'box', p.box.x, p.box.y, p.box.w, p.box.h);
  this._img(ctx, 'bell', p.bell.x, p.bell.y, p.bell.w, p.bell.h);
};

TaskScene.prototype._renderRow = function (ctx, row) {
  var p = row.box, k = this.k, item = row.item;
  var H = p.h;
  var r = H * 0.5;                       // 胶囊圆角
  var pad = H * 0.12;

  // 卡片：投影 + 奶油底 + 描边（内圈一道浅描边，做出贴纸感）
  ctx.fillStyle = C.shadow;
  D.roundRect(ctx, p.x + 2 * k, p.y + 6 * k, p.w, H, r); ctx.fill();
  ctx.fillStyle = C.card;
  D.roundRect(ctx, p.x, p.y, p.w, H, r); ctx.fill();
  ctx.strokeStyle = C.rim;
  ctx.lineWidth = 2.4 * k;
  D.roundRect(ctx, p.x, p.y, p.w, H, r); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.6 * k;
  D.roundRect(ctx, p.x + 4 * k, p.y + 4 * k, p.w - 8 * k, H - 8 * k, r - 4 * k); ctx.stroke();

  // 猫头：垂直居中
  var head = H * 0.70;
  var hx = p.x + pad;
  var hy = p.y + (H - head) / 2;
  this._img(ctx, item.icon, hx, hy, head, head);

  // 文案
  var tx = hx + head + H * 0.12;
  var cur = Tasks.count(item.id);
  var goal = item.goal;
  var done = cur >= goal;

  D.label(ctx, I.t(item.titleKey, { n: goal }), tx, p.y + H * 0.355, H * 0.285, C.title, {
    align: 'left', stroke: 'rgba(255,255,255,0.9)', strokeW: 4 * k, maxW: p.w * 0.42
  });
  D.label(ctx, I.t(item.subKey, { n: goal }), tx, p.y + H * 0.675, H * 0.155, C.sub, {
    align: 'left', maxW: p.w * 0.42
  });

  // 右侧：奖励图标固定在最右，进度紧贴其左侧
  var farW = H * 0.72, farH = farW * 0.58;
  var farX = p.x + p.w - pad - farW;
  var progRight = farX - H * 0.08;
  D.label(ctx, cur + '/' + goal, progRight, p.y + H * 0.5, H * 0.235,
    done ? C.progressDone : C.progress, { align: 'right', maxW: p.w * 0.22 });

  if (item.id === 'clear') this._img(ctx, 'fish_orange', farX, p.y + (H - farH) / 2, farW, farH);
  else if (item.id === 'combo') this._img(ctx, 'fish_blue', farX, p.y + (H - farH) / 2, farW, farH);
  else this._coin(ctx, farX + farW / 2, p.y + H / 2, farH * 0.44, done);

  // 完成徽标：卡右上角，压在描边上（与设计稿一致）
  if (done) {
    var bx = p.x + p.w - H * 0.16, by = p.y + H * 0.16, br = H * 0.105;
    ctx.fillStyle = 'rgba(140,90,60,0.20)';
    ctx.beginPath(); ctx.arc(bx, by + 2 * k, br, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F09A54';
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFF6E4'; ctx.lineWidth = 2.2 * k; ctx.stroke();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3.2 * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx - br * 0.45, by + br * 0.05);
    ctx.lineTo(bx - br * 0.12, by + br * 0.38);
    ctx.lineTo(bx + br * 0.46, by - br * 0.32);
    ctx.stroke();
  }
};

/** 咪币图标（任务行最右侧，替代设计稿里的第二条计数） */
TaskScene.prototype._coin = function (ctx, cx, cy, r, done) {
  ctx.fillStyle = done ? '#F6B24A' : '#F6C877';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#E09A3C'; ctx.lineWidth = r * 0.18;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(cx - r * 0.28, cy - r * 0.30, r * 0.22, 0, Math.PI * 2); ctx.fill();
};

TaskScene.prototype._renderBottom = function (ctx) {
  var k = this.k, p = this.pos, s = this.slots;

  // 第一排：灰猫 · 黑猫 · 铁锤 · 限时挑战（等大、四等分居中）
  this._img(ctx, 'gcat', s[0].x, s[0].y, s[0].w, s[0].h);
  this._img(ctx, 'bcat', s[1].x, s[1].y, s[1].w, s[1].h);
  this._img(ctx, 'hammer', s[2].x, s[2].y, s[2].w, s[2].h);

  // 限时挑战：同尺寸卡片 + 底部文案
  var L = s[3];
  var r = A_BOX * 0.26 * k;
  ctx.fillStyle = 'rgba(140,90,60,0.14)';
  D.roundRect(ctx, L.x + 2 * k, L.y + 5 * k, L.w, L.h, r); ctx.fill();
  ctx.fillStyle = '#FFF4DE';
  D.roundRect(ctx, L.x, L.y, L.w, L.h, r); ctx.fill();
  ctx.strokeStyle = '#F0B36A'; ctx.lineWidth = 2 * k;
  D.roundRect(ctx, L.x, L.y, L.w, L.h, r); ctx.stroke();
  var lh = L.h * 0.70, lw = lh * 144 / 126;
  this._img(ctx, 'limit_card', L.x + (L.w - lw) / 2, L.y + L.h * 0.06, lw, lh);
  D.label(ctx, I.t('taskLimit'), L.x + L.w / 2, L.y + L.h + 15 * k, 19 * k, '#8A4A22', {
    stroke: 'rgba(255,246,226,0.9)', strokeW: 4 * k, maxW: L.w * 1.35
  });

  // 第二排：糖果 · 领取奖励 · 周末礼盒（等距三段）
  this._img(ctx, 'candy', p.candy.x, p.candy.y, p.candy.w, p.candy.h);

  var c = p.cta;
  var claimed = Tasks.claimed(), all = Tasks.allDone();
  var alpha = (claimed || !all) ? 0.62 : 1;
  ctx.globalAlpha = alpha;
  D.pill(ctx, c.x, c.y, c.w, c.h, C.cta1, C.cta2, '#FFF8E6', c.h * 0.5);
  ctx.globalAlpha = 1;
  D.label(ctx, I.t('taskClaim'), c.x + c.w / 2, c.y + c.h * 0.53, c.h * 0.44, C.ctaText, {
    stroke: 'rgba(255,248,230,0.85)', strokeW: 3 * k, maxW: c.w * 0.76
  });

  this._img(ctx, 'gift', p.gift.x, p.gift.y, p.gift.w, p.gift.h);
  D.label(ctx, I.t('taskWeekend'), p.gift.x + p.gift.w / 2, p.gift.y + p.gift.h + 16 * k,
    18 * k, '#8A4A22', { stroke: 'rgba(255,246,226,0.9)', strokeW: 4 * k, maxW: 150 * k });
};

// ---------------- 触控 ----------------
TaskScene.prototype._btns = function () {
  return [this.hitBack, this.hitLimit, this.hitCta, this.hitGift, this.hitCandy]
    .concat(this.hitChips);
};

TaskScene.prototype.onTouchDown = function () {
  var b = this._btns();
  for (var i = 0; i < b.length; i++) b[i]._p = true;
};

TaskScene.prototype.onTouchUp = function (x, y) {
  if (D.hit(this.hitBack, x, y)) { this.engine.goto('home'); return; }

  if (D.hit(this.hitCta, x, y)) {
    if (Tasks.claimed()) { this.engine.toast(I.t('taskClaimed')); return; }
    if (!Tasks.allDone()) { this.engine.toast(I.t('taskNotDone')); return; }
    var n = Tasks.claim();
    this.engine.toast(I.t('taskClaimOk', { n: n }));
    this.engine.burst(this.hitCta.x + this.hitCta.w / 2, this.hitCta.y + this.hitCta.h / 2,
      '#FFC15A', 16, { star: true, speed: 220 });
    return;
  }
  if (D.hit(this.hitLimit, x, y)) { this.engine.toast(I.t('eventSoon')); return; }
  if (D.hit(this.hitGift, x, y)) { this.engine.toast(I.t('eventSoon')); return; }
  if (D.hit(this.hitCandy, x, y)) { this.engine.toast(I.t('eventSoon')); return; }

  for (var i = 0; i < this.rows.length; i++) {
    if (D.hit(this.rows[i].box, x, y)) {
      this.engine.goto('select');
      return;
    }
  }
  // 底部导航
  var nm = Nav.metrics(this.engine.W, this.engine.H);
  var idx = Math.floor(x / nm.slot);
  if (y >= nm.y && idx >= 0 && idx < Nav.TABS.length) {
    var route = Nav.TABS[idx].route;
    if (route === 'task') return;
    this.engine.goto(route);
  }
};

module.exports = TaskScene;
