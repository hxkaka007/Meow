/** 选关页：展示已解锁关卡，可自由跳转；也提供直达当前进度的快捷入口 */
var D = require('../ui/draw.js');
var Save = require('../core/save.js');
var Level = require('../core/level.js');
var I = require('../core/i18n.js');
var Decor = require('../ui/decor.js');

function SelectLevel() { }

SelectLevel.prototype.onShow = function () {
  this.perPage = 24;
  this.cols = 4;
  // 默认打开当前进度所在页，高关玩家不必从第 1 页翻起
  this.page = Math.max(0, Math.floor((Save.get('maxLevel') - 1) / this.perPage));
  this.maxPage = this.page;
  this.levelBtns = [];
};

SelectLevel.prototype.update = function (dt) {
  this.t = (this.t || 0) + (dt || 0.016);
};

SelectLevel.prototype.layout = function () {
  var W = this.engine.W, H = this.engine.H;
  var maxLv = Save.get('maxLevel');
  this.maxPage = Math.max(0, Math.ceil(maxLv / this.perPage) - 1);
  if (this.page > this.maxPage) this.page = this.maxPage;

  this.gridTop = 156;
  this.navY = H - 96;
  var gap = 10;
  var colW = (W - 60) / this.cols;
  var avail = this.navY - this.gridTop - 12;
  // 格子尺寸同时受屏宽与屏高约束，6 行网格不会压住底部翻页按钮
  this.cell = Math.max(28, Math.min(colW - gap, (avail - 5 * gap) / 6));
  this.gap = gap;
  this.gridX = (W - (this.cols * this.cell + (this.cols - 1) * gap)) / 2;

  var atFirst = this.page <= 0, atLast = this.page >= this.maxPage;
  this.backBtn = { key: 'back', text: I.t('backArrow'), x: 20, y: 40, w: 88, h: 40, color: '#c8b8a8', color2: '#d8ccc0', fontSize: 16 };
  this.continueBtn = {
    key: 'continue', text: I.t('selContinue', { n: maxLv }),
    x: W / 2 - 110, y: 104, w: 220, h: 38,
    color: '#f2934a', color2: '#ffc77c', fontSize: 16
  };
  this.prevBtn = {
    key: 'prev', text: I.t('prevPage'), x: W / 2 - 130, y: this.navY, w: 110, h: 44,
    color: atFirst ? '#d8d0c4' : '#b0a8c0', color2: atFirst ? '#e4ddd2' : '#c2bad0', fontSize: 16
  };
  this.nextBtn = {
    key: 'next', text: I.t('nextPage'), x: W / 2 + 20, y: this.navY, w: 110, h: 44,
    color: atLast ? '#d8d0c4' : '#b0a8c0', color2: atLast ? '#e4ddd2' : '#c2bad0', fontSize: 16
  };
};

SelectLevel.prototype.render = function (ctx) {
  Decor.paws(ctx, this.engine.W, this.engine.H, this.t || 0, 4);
  this.layout();
  var W = this.engine.W;
  var maxLv = Save.get('maxLevel');
  var start = this.page * this.perPage + 1;

  D.text(ctx, I.t('selTitle'), W / 2, 62, 24, '#e0784a');
  D.text(ctx, I.t('selUnlocked', { n: maxLv }) + ' · ' + Level.stageName(maxLv), W / 2, 92, 14, '#a08868');
  D.button(ctx, this.backBtn);
  D.button(ctx, this.continueBtn);
  D.button(ctx, this.prevBtn);
  D.button(ctx, this.nextBtn);

  this.levelBtns = [];
  for (var i = 0; i < this.perPage; i++) {
    var lv = start + i;
    if (lv > maxLv + 23) break; // 每页最多 24 格，超出已解锁范围的是锁定预览
    var r = Math.floor(i / this.cols), c = i % this.cols;
    var x = this.gridX + c * (this.cell + this.gap);
    var y = this.gridTop + r * (this.cell + this.gap);
    var unlocked = lv <= maxLv;
    var btn = {
      key: 'lv' + lv, level: lv, locked: !unlocked,
      x: x, y: y, w: this.cell, h: this.cell,
      color: unlocked ? '#ffb26e' : '#d8d0c4', color2: unlocked ? '#ffcc96' : '#e4ddd2'
    };
    this.levelBtns.push(btn);
    D.button(ctx, {
      x: btn.x, y: btn.y, w: btn.w, h: btn.h, color: btn.color, color2: btn.color2,
      text: unlocked ? lv : '🔒', fontSize: Math.min(18, this.cell * 0.3),
      textColor: unlocked ? '#7a4a20' : '#b0a898'
    });
    if (unlocked) D.text(ctx, Level.stageName(lv), btn.x + btn.w / 2, btn.y + btn.h - 12, 10, '#9a6a3a');
  }
};

SelectLevel.prototype._allBtns = function () {
  return (this.levelBtns || []).concat([this.backBtn, this.continueBtn, this.prevBtn, this.nextBtn]);
};

SelectLevel.prototype.onTouchDown = function (x, y) {
  var all = this._allBtns();
  for (var i = 0; i < all.length; i++) {
    if (!all[i]) continue;
    all[i]._pressed = D.hit(all[i], x, y);
  }
};

SelectLevel.prototype.onTouchUp = function (x, y) {
  var all = this._allBtns();
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    if (!b) continue;
    b._pressed = false;
    if (!D.hit(b, x, y)) continue;
    if (b.key === 'back') this.engine.goto('home');
    else if (b.key === 'continue') this.engine.goto('play', { level: Save.get('maxLevel') });
    else if (b.key === 'prev') { if (this.page > 0) this.page--; }
    else if (b.key === 'next') { if (this.page < this.maxPage) this.page++; }
    else if (b.level) {
      if (b.locked) this.engine.toast(I.t('selLockedTip', { n: b.level }));
      else this.engine.goto('play', { level: b.level });
    }
  }
};

module.exports = SelectLevel;
