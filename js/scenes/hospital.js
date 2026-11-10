/**
 * 宠物医院：生病猫列表 / 诊断 / 治疗
 */
var D = require('../ui/draw.js');
var Nav = require('../ui/nav.js');
var Save = require('../core/save.js');
var Cats = require('../core/cats.js');
var CT = require('../core/catTypes.js');
var I = require('../core/i18n.js');
var Decor = require('../ui/decor.js');

function Hospital() { }

Hospital.prototype.onShow = function () {
  Save.tickAll();
};

Hospital.prototype.update = function (dt) {
  this.t = (this.t || 0) + (dt || 0.016);
};

Hospital.prototype.sickCats = function () {
  var cats = Save.get('cats');
  var out = [];
  for (var i = 0; i < cats.length; i++) if (cats[i].sickness) out.push(cats[i]);
  return out;
};

Hospital.prototype.render = function (ctx) {
  Decor.paws(ctx, this.engine.W, this.engine.H, this.t || 0, 3);
  var W = this.engine.W, H = this.engine.H;
  Nav.topBar(this.engine, ctx);
  D.text(ctx, I.t('hospTitle'), W / 2, 66, 22, '#e0784a');

  var sick = this.sickCats();
  var y = 96;
  this.cureBtns = [];

  if (!sick.length) {
    D.panel(ctx, W / 2 - 130, H * 0.3, 260, 100);
    D.text(ctx, I.t('allHealthy'), W / 2, H * 0.3 + 40, 17, '#6ecf9a');
    D.text(ctx, I.t('hospTips'), W / 2, H * 0.3 + 66, 12, '#b09878');
  }

  // 列表底边留出 PAD_BOTTOM，避免最后一张卡直接贴住底部导航
  var PAD_BOTTOM = 28;
  for (var i = 0; i < sick.length && y + 120 < Nav.metrics(W, H).y - PAD_BOTTOM - 56; i++) {
    var cat = sick[i];
    var s = CT.SICKNESS[cat.sickness];
    var t = CT.typeById(cat.typeId);
    ctx.fillStyle = '#fff';
    D.roundRect(ctx, 20, y, W - 40, 112, 14);
    ctx.fill();

    this.engine.drawCat(ctx, cat.typeId, 30, y + 12, 88, 88);

    D.text(ctx, cat.name + ' Lv.' + cat.level, 130, y + 22, 15, '#6a5242', 'left');
    this.engine.drawIcon(ctx, 'sick_' + s.icon, 130, y + 34, 30, 30);
    D.text(ctx, CT.sickName(s) + '：' + CT.sickDesc(s), 168, y + 49, 12, '#c07050', 'left');
    D.text(ctx, I.t('breedLabel', { name: CT.typeName(t), rarity: CT.RARITY[t.rarity].label }),
      130, y + 74, 11, '#a09080', 'left');

    var canPay = Save.get('coin') >= s.cost;
    var btn = {
      key: 'cure_' + cat.id, catId: cat.id, cost: s.cost, text: I.t('cureBtn'),
      x: W - 110, y: y + 32, w: 80, h: 44,
      color: canPay ? '#6ecf9a' : '#c8c0b4', color2: canPay ? '#90ddb4' : '#d8d0c4',
      fontSize: 14
    };
    this.cureBtns.push(btn);
    D.button(ctx, btn);
    D.text(ctx, I.t('cureCost', { n: s.cost }), W - 70, y + 88, 10, '#a08060');
    y += 124;
  }

  // 预防提示（贴着底部导航上方，不能压到导航条，留出明显间隔）
  var nm = Nav.metrics(W, H);
  var py = nm.y - 66;
  D.text(ctx, I.t('prevTip'), W / 2, py, 13, '#c9a284');
  D.text(ctx, I.t('prevTip2'), W / 2, py + 20, 11, '#b8a890');

  this.navBtns = Nav.render(this.engine, ctx, 'hospital');
};

Hospital.prototype.onTouchDown = function (x, y) {
  var press = function (arr) {
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) arr[i]._p = D.hit(arr[i], x, y);
  };
  press(this.cureBtns); press(this.navBtns);
};

Hospital.prototype.onTouchUp = function (x, y) {
  var self = this;
  function release(arr, fn) {
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      b._p = false;
      if (D.hit(b, x, y) && fn) fn(b);
    }
  }
  release(this.cureBtns, function (b) {
    var cats = Save.get('cats');
    var cat = null;
    for (var i = 0; i < cats.length; i++) if (cats[i].id === b.catId) cat = cats[i];
    if (!cat || !cat.sickness) return;
    if (!Save.spendCoin(b.cost)) { self.engine.toast(I.t('noCoinCure')); return; }
    var s = Cats.cure(cat, Date.now());
    Save.save();
    self.engine.toast(I.t('curedMsg', { name: cat.name, sick: CT.sickName(s) }));
  });
  release(this.navBtns, function (b) {
    if (b.key !== 'hospital') self.engine.goto(b.key);
  });
};

module.exports = Hospital;
