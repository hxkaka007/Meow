/**
 * 商城：分类购买 食物/玩具/家具/咪窝/道具
 */
var D = require('../ui/draw.js');
var Nav = require('../ui/nav.js');
var Save = require('../core/save.js');
var Shop = require('../core/shop.js');
var I = require('../core/i18n.js');
var Decor = require('../ui/decor.js');

function ShopScene() { }

ShopScene.prototype.onShow = function () {
  this.cat = 'food';
};

ShopScene.prototype.update = function (dt) {
  this.t = (this.t || 0) + (dt || 0.016);
};

ShopScene.prototype.render = function (ctx) {
  var W = this.engine.W, H = this.engine.H;
  Decor.paws(ctx, W, H, this.t || 0, 2);
  Nav.topBar(this.engine, ctx);
  D.text(ctx, I.t('shopTitle'), W / 2, 66, 22, '#e0784a');

  // 分类页签
  var cats = Shop.CATEGORIES;
  var tw = (W - 40) / cats.length;
  this.tabBtns = [];
  for (var i = 0; i < cats.length; i++) {
    var x = 20 + i * tw;
    var btn = { key: cats[i].key, x: x, y: 84, w: tw - 6, h: 34 };
    this.tabBtns.push(btn);
    var act = this.cat === cats[i].key;
    ctx.fillStyle = act ? '#ffb26e' : 'rgba(255,255,255,0.85)';
    D.roundRect(ctx, x, 84, tw - 6, 34, 17);
    ctx.fill();
    D.text(ctx, Shop.catName(cats[i]), x + (tw - 6) / 2, 101, 13, act ? '#7a4a20' : '#9a8a78');
  }

  // 商品列表
  var items = Shop.byCategory(this.cat);
  var y = 132;
  var rowH = 76;
  this.buyBtns = [];
  // 列表底边留出 PAD_BOTTOM，避免最后一行卡直接贴住底部导航
  var PAD_BOTTOM = 28;
  for (var s = 0; s < items.length && y + rowH < Nav.metrics(W, H).y - PAD_BOTTOM; s++) {
    var it = items[s];
    ctx.fillStyle = '#fff';
    D.roundRect(ctx, 20, y, W - 40, rowH - 8, 12);
    ctx.fill();

    this.engine.drawIcon(ctx, it.icon, 30, y + 6, 52, 52);

    D.text(ctx, Shop.nameOf(it), 94, y + 20, 15, '#6a5242', 'left');
    D.text(ctx, Shop.descOf(it), 94, y + 42, 12, '#a09080', 'left');

    // 已拥有家具标记
    var owned = Save.get('furniture').indexOf(it.itemId) >= 0;
    var isHome = it.category === 'home';
    var canBuy = !(owned && (it.category === 'furniture' || isHome));

    var buyBtn = {
      key: 'buy_' + it.itemId, itemId: it.itemId, price: it.price, canBuy: canBuy,
      text: I.t('priceTag', { n: it.price }),
      x: W - 108, y: y + 14, w: 78, h: 40,
      color: canBuy ? '#ffb26e' : '#c8c0b4', color2: canBuy ? '#ffcc96' : '#d8d0c4',
      fontSize: 13, textColor: '#7a4a20'
    };
    this.buyBtns.push(buyBtn);
    D.button(ctx, buyBtn);
    if (!canBuy) D.text(ctx, I.t('ownedTag'), W - 69, y + 62, 10, '#b0a898');

    // 背包数量角标（消耗品）
    if (it.category === 'food' || it.category === 'toy') {
      var cnt = Save.get('inventory')[it.itemId] || 0;
      D.text(ctx, I.t('holdN', { n: cnt }), W - 69, y + 62, 10, '#b09878');
    }
    y += rowH;
  }

  this.navBtns = Nav.render(this.engine, ctx, 'shop');
};

ShopScene.prototype.onTouchDown = function (x, y) {
  var press = function (arr) {
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) arr[i]._p = D.hit(arr[i], x, y);
  };
  press(this.tabBtns); press(this.buyBtns); press(this.navBtns);
};

ShopScene.prototype.onTouchUp = function (x, y) {
  var self = this;
  function release(arr, fn) {
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      b._p = false;
      if (D.hit(b, x, y) && fn) fn(b);
    }
  }
  release(this.tabBtns, function (b) { self.cat = b.key; });
  release(this.buyBtns, function (b) {
    if (!b.canBuy) { self.engine.toast(I.t('alreadyOwned')); return; }
    if (!Save.spendCoin(b.price)) { self.engine.toast(I.t('shopNoCoin')); return; }
    var it = Shop.byId(b.itemId);
    if (it.category === 'furniture') {
      Save.get('furniture').push(it.itemId);
      Save.save();
      self.engine.toast(I.t('furPlaced', { name: Shop.nameOf(it) }));
    } else if (it.category === 'home') {
      Save.addHome();
      self.engine.toast(I.t('homeOpened'));
    } else if (it.category === 'prop') {
      var props = Save.get('props');
      props[it.effectValue] = (props[it.effectValue] || 0) + 1;
      Save.save();
      self.engine.toast(I.t('propPlus', { name: Shop.nameOf(it) }));
    } else {
      var inv = Save.get('inventory');
      inv[it.itemId] = (inv[it.itemId] || 0) + 1;
      Save.save();
      self.engine.toast(I.t('boughtOk', { name: Shop.nameOf(it) }));
    }
  });
  release(this.navBtns, function (b) {
    if (b.key !== 'shop') self.engine.goto(b.key);
  });
};

module.exports = ShopScene;
