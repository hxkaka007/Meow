/**
 * 背包：道具（闯关消耗） + 物品（食物/玩具/家具计数）
 */
var D = require('../ui/draw.js');
var Nav = require('../ui/nav.js');
var Save = require('../core/save.js');
var Shop = require('../core/shop.js');
var Theme = require('../core/theme.js');
var I = require('../core/i18n.js');
var Decor = require('../ui/decor.js');

function Bag() { }

Bag.prototype.onShow = function () {
  this.t = 0;
};

Bag.prototype.update = function (dt) { this.t += dt; };

Bag.prototype.layout = function () {
  var W = this.engine.W, H = this.engine.H;
  this.backBtn = { key: 'back', text: '←', x: 16, y: 16, w: 40, h: 38, color: '#d8c8b8', color2: '#e6dccc', fontSize: 18 };
  this.rows = [];
  var y = 78;
  var T = Theme.current();
  // 道具（props 计数）
  var PROPS = [['hint', 'prop_hint'], ['shuffle', 'prop_shuffle'], ['bomb', 'prop_bomb'], ['time', 'prop_time']];
  var props = Save.load().props || {};
  for (var i = 0; i < PROPS.length; i++) {
    var n = props[PROPS[i][0]] || 0;
    if (n <= 0) continue;
    var it = Shop.byId('prop_' + PROPS[i][0]);
    this.rows.push({ icon: PROPS[i][1], name: it ? it.name : PROPS[i][0], count: n, y: y });
    y += 62;
  }
  // 物品（inventory 计数）
  var inv = Save.get('inventory') || {};
  for (var key in inv) {
    if (!inv[key]) continue;
    var it2 = Shop.byId(key);
    if (!it2) continue;
    this.rows.push({ icon: it2.icon, name: it2.name, count: inv[key], y: y });
    y += 62;
  }
  this.empty = this.rows.length === 0;
};

Bag.prototype.render = function (ctx) {
  this.layout();
  var W = this.engine.W, H = this.engine.H;
  Decor.paws(ctx, W, H, this.t || 0, 7);
  var T = Theme.current();
  // 顶栏
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  D.roundRect(ctx, 8, 10, W - 16, 56, 16); ctx.fill();
  D.button(ctx, this.backBtn);
  D.text(ctx, I.t('bagTitle'), W / 2, 38, 18, T.title);

  if (this.empty) {
    D.text(ctx, I.t('bagEmpty'), W / 2, H * 0.4, 15, T.sub);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    D.roundRect(ctx, 14, 70, W - 28, this.rows.length * 62 + 16, 18); ctx.fill();
    for (var i = 0; i < this.rows.length; i++) {
      var r = this.rows[i];
      var y = 78 + i * 62;
      ctx.fillStyle = T.cardSoft;
      D.roundRect(ctx, 24, y, 48, 48, 12); ctx.fill();
      this.engine.drawIcon(ctx, r.icon, 28, y + 4, 40, 40);
      D.text(ctx, r.name, 86, y + 18, 15, T.text, 'left');
      D.text(ctx, '× ' + r.count, 86, y + 38, 12, T.sub, 'left');
    }
    D.text(ctx, I.t('useInGame'), W / 2, 92 + this.rows.length * 62, 11, T.sub);
  }
  this.navBtns = Nav.render(this.engine, ctx, 'bag');
};

Bag.prototype.onTouchUp = function (x, y) {
  var self = this;
  if (D.hit(this.backBtn, x, y)) { this.engine.goto('home'); return; }
  for (var i = 0; i < (this.navBtns || []).length; i++) {
    var b = this.navBtns[i];
    if (D.hit(b, x, y) && b.key !== 'bag') { this.engine.goto(b.key); return; }
  }
};

module.exports = Bag;
