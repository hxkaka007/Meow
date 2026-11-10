/** 选关页：展示已解锁关卡，可自由跳转已解锁的最大关卡 */
var D = require('../ui/draw.js');
var Save = require('../core/save.js');
var Level = require('../core/level.js');
var I = require('../core/i18n.js');
var Decor = require('../ui/decor.js');

function SelectLevel() { this.scroll = 0; }

SelectLevel.prototype.onShow = function () {
  this.page = 0;
  this.perPage = 24;
  this.btns = [];
};

SelectLevel.prototype.update = function (dt) {
  this.t = (this.t || 0) + (dt || 0.016);
};

SelectLevel.prototype.layout = function () {
  var W = this.engine.W, H = this.engine.H;
  this.backBtn = { key: 'back', text: I.t('backArrow'), x: 20, y: 40, w: 88, h: 40, color: '#c8b8a8', color2: '#d8ccc0', fontSize: 16 };
  this.prevBtn = { text: I.t('prevPage'), x: W / 2 - 130, y: H - 110, w: 110, h: 44, color: '#b0a8c0', color2: '#c2bad0', fontSize: 16 };
  this.nextBtn = { text: I.t('nextPage'), x: W / 2 + 20, y: H - 110, w: 110, h: 44, color: '#b0a8c0', color2: '#c2bad0', fontSize: 16 };
};

SelectLevel.prototype.render = function (ctx) {
  Decor.paws(ctx, this.engine.W, this.engine.H, this.t || 0, 4);
  this.layout();
  var W = this.engine.W, H = this.engine.H;
  D.text(ctx, I.t('selTitle'), W / 2, 66, 24, '#e0784a');
  D.button(ctx, this.backBtn);
  D.text(ctx, I.t('selUnlocked', { n: Save.get('maxLevel') }) + ' · ' + Level.stageName(Save.get('maxLevel')), W / 2, 108, 14, '#a08868');

  var maxLv = Save.get('maxLevel');
  var start = this.page * this.perPage + 1;
  var cols = 4;
  var cell = (W - 60) / cols;
  this.levelBtns = [];
  for (var i = 0; i < this.perPage; i++) {
    var lv = start + i;
    if (lv > maxLv + 23) break; // 最多预展示 24 关
    var r = Math.floor(i / cols), c = i % cols;
    var x = 30 + c * cell, y = 140 + r * (cell + 10);
    var unlocked = lv <= maxLv;
    var btn = {
      key: 'lv' + lv, level: lv, locked: !unlocked,
      x: x, y: y, w: cell - 10, h: cell - 10,
      color: unlocked ? '#ffb26e' : '#d8d0c4', color2: unlocked ? '#ffcc96' : '#e4ddd2'
    };
    this.levelBtns.push(btn);
    D.button(ctx, {
      x: btn.x, y: btn.y, w: btn.w, h: btn.h, color: btn.color, color2: btn.color2,
      text: unlocked ? lv : '🔒', fontSize: 18, textColor: unlocked ? '#7a4a20' : '#b0a898'
    });
    if (unlocked) D.text(ctx, Level.stageName(lv), btn.x + btn.w / 2, btn.y + btn.h - 12, 10, '#9a6a3a');
  }
  D.button(ctx, this.prevBtn);
  D.button(ctx, this.nextBtn);
};

SelectLevel.prototype.onTouchDown = function (x, y) {
  var all = (this.levelBtns || []).concat([this.backBtn, this.prevBtn, this.nextBtn]);
  for (var i = 0; i < all.length; i++)
    all[i]._pressed = D.hit(all[i], x, y);
};

SelectLevel.prototype.onTouchUp = function (x, y) {
  var all = (this.levelBtns || []).concat([this.backBtn, this.prevBtn, this.nextBtn]);
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    b._pressed = false;
    if (!D.hit(b, x, y)) continue;
    if (b.key === 'back') this.engine.pop();
    else if (b === this.prevBtn) { if (this.page > 0) this.page--; }
    else if (b === this.nextBtn) this.page++;
    else if (b.level) this.engine.goto('play', { level: b.level });
  }
};

module.exports = SelectLevel;
