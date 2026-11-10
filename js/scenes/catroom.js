/**
 * 咪窝（小喵屋）：参考分层设计稿的真实素材版
 *
 * 表现层全部交给 js/ui/nestArt.js（17 张分层素材 + 纯 Canvas 兜底），
 * 本文件只负责：取存档数据、算四个属性数值、注册点击热区、执行互动 /
 * 领养 / 详情 / 设置 / 底部导航。互动与存档逻辑与旧版保持一致。
 */
var D = require('../ui/draw.js');
var Nest = require('../ui/nestArt.js');
var Rig = require('../ui/catRig.js');
var Save = require('../core/save.js');
var Cats = require('../core/cats.js');
var CT = require('../core/catTypes.js');
var Breeds = require('../core/breeds.js');
var SPRITES = require('../core/sprites.js');
var Shop = require('../core/shop.js');
var I = require('../core/i18n.js');
var A = require('../adapter.js');

function CatRoom() { }

/** 领养弹框每页 3x3 = 9 个品种，25 个品种分 3 页 */
var ADOPT_PER_PAGE = 9;
var ADOPT_COLS = 3;

/** 当前动画时间（预览页可用 ?t= 冻结，方便截图核对姿态） */
function rigTime(scene) {
  if (typeof window !== 'undefined' && window.__RIG_TIME !== undefined) return window.__RIG_TIME;
  return scene.engine.t || 0;
}

/** 点击 / 互动后的开心强度（0..1，0.8 秒衰减） */
function rigHappy(scene) {
  if (scene._happyAt === undefined) return 0;
  return Math.max(0, 1 - (rigTime(scene) - scene._happyAt) / 0.8);
}

/**
 * 按 contain 画整猫立绘，并套上可动部件（眼睛/鼻子/嘴巴/身体）。
 * 领养九宫格用 light 模式（鼻子嘴巴合成一片），详情弹窗用 full 模式。
 * 素材未就绪 / 不支持离屏画布时退回原来的静态画法 + 猫脸雪碧图。
 */
function drawBreed(ctx, engine, path, typeId, x, y, w, h, opts) {
  opts = opts || {};
  var im = engine.img && path ? engine.img(path) : null;
  if (im && im.width) {
    var s = Math.min(w / im.width, h / im.height);
    var dw = im.width * s, dh = im.height * s;
    var dx = x + (w - dw) / 2, dy = y + h - dh;
    var bo = Rig.breedOpts(engine, path, dx, dy, dw, dh, {
      t: opts.t, seed: opts.seed || Rig.seedOf(path),
      happy: opts.happy, mode: opts.mode || 'full'
    });
    if (bo && Rig.paint(ctx, engine, bo)) return true;
    try {
      ctx.drawImage(im, dx, dy, dw, dh);
      return true;
    } catch (e) { }
  }
  return engine.drawCat(ctx, typeId, x + w * 0.12, y, w * 0.76, h * 0.88);
}

CatRoom.prototype.onShow = function () {
  this.homeIdx = 0;
  this.detail = null;      // 详情弹窗（非 null 即显示）
  this.selCat = null;      // 信息卡当前展示的猫
  this.adoptSheet = false; // 领养面板
  this.adoptPage = 0;      // 领养品种翻页
  this.settingsOpen = false;
  this.washCd = {};        // 洗澡冷却
  this.popup = null;
  this._happyAt = undefined; // 可动部件：点击 / 互动后的开心弹跳起点
  // 分包门闸：nest + breeds 资源在分包内，未加载前显示「加载中」
  this._subsReady = false;
  var self = this;
  this.engine.ensureSubs(['nest', 'breeds'], function () {
    self.engine.warmSubs();
    // 分包下载完到图片解码之间会短暂缺图：等关键图就绪再撤加载态
    // （2s 超时兜底，弱网/解码慢也不会卡住）
    var keys = (Nest.ALL || []).concat(Breeds.ALL || []);
    self.engine.waitImages(keys, function () { self._subsReady = true; }, 2000);
  });
};

/** 咪窝显示名（跟语言走；老存档没有 nameKey 时用存下来的中文名） */
function homeName(h) {
  if (h && h.nameKey) return I.t(h.nameKey, { n: h.num });
  return h ? h.name : '';
}

CatRoom.prototype.curHome = function () {
  var homes = Save.get('homes');
  return homes[Math.min(this.homeIdx, homes.length - 1)];
};

/** 当前展示的猫：优先上次点开的，否则咪窝里第一只 */
CatRoom.prototype.showCat = function () {
  if (this.selCat) return this.selCat;
  var cats = Save.catsInHome(this.curHome().id);
  return cats.length ? cats[0] : null;
};

/** 四个状态：饱足 / 亲密度 / 心情 / 健康，全部由存档实时推导 */
CatRoom.prototype.statsOf = function (cat) {
  if (!cat) return [0, 0, 0, 0];
  var s = cat.stats || {};
  var bond = Math.min(100, Math.round(50 + (cat.level || 1) * 6 + (cat.exp || 0) * 0.15));
  var health = Math.max(0, Math.min(100, Math.round(
    100 - (cat.sickness ? 35 : 0) - (100 - (s.cleanliness || 0)) * 0.25)));
  return [Math.round(s.hunger || 0), bond, Math.round(s.happiness || 0), health];
};

CatRoom.prototype.update = function (dt) {
  this.t = (this.t || 0) + dt;
  var sick = Save.tickAll();
  if (sick.length && !this._sickToasted) {
    this._sickToasted = true;
    this.engine.toast(I.t('sickToast', { name: sick[0].name }));
  }
};

// ---------------- 分包加载态 ----------------
CatRoom.prototype._drawLoading = function (ctx, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(249,233,218,0.96)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#7A3D18';
  ctx.font = 'bold ' + Math.round(W * 0.052) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var txt = (I.lang && I.lang() === 'en') ? 'Loading…' : '加载中…';
  ctx.fillText(txt, W / 2, H / 2);
  ctx.restore();
};

// ---------------- 主渲染 ----------------
CatRoom.prototype.render = function (ctx) {
  var W = this.engine.W, H = this.engine.H;
  if (!this._subsReady) { this._drawLoading(ctx, W, H); return; }
  var L = Nest.layout(W, H, A.safeTop || 0);
  this.L = L;
  var cat = this.showCat();
  var art = Breeds.artOf(cat);
  this._rigT = rigTime(this);
  this._rigSeed = Rig.seedOf(art || (cat && cat.id) || 'cat');
  this._rigHappy = rigHappy(this);

  Nest.paint(ctx, this.engine, L, {
    coin: Save.get('coin'),
    catName: cat ? cat.name : '',
    sign: I.t('nestSign'),
    stats: this.statsOf(cat),
    empty: !cat,                 // 空窝时舞台上方、信息卡头像都不画猫
    catArt: art,                 // 按领养时选中的品种显示对应整猫立绘
    catFace: Breeds.faceOf(cat), // 信息卡圆形头像：cat_atlas.png 里对应品种的猫头帧
    catType: cat ? cat.typeId : '',  // 图集未就绪时的兜底
    rigT: this._rigT,            // 可动部件：统一时间轴
    rigSeed: this._rigSeed,      // 每只品种自己的呼吸/眨眼节奏
    rigHappy: this._rigHappy     // 点击 / 喂食 / 玩耍触发的开心反应
  });

  // 点击热区（几何全部来自 nestArt 布局，保证与美术对齐）
  this.actionBtns = L.actionBtns;
  this.navBtns = L.navBtns;
  this.settingsBtn = L.settingsHit;
  this.coinBtn = L.coinHit;
  this.avatarBtn = L.avatarHit;
  this.cardBtn = L.cardHit;
  this.catBtn = L.catHit;
  this.bubbleBtn = L.bubbleHit;

  if (this.detail) this._renderDetail(ctx, W, H);
  if (this.adoptSheet) this._renderAdopt(ctx, W, H);
  if (this.settingsOpen) this._renderSettings(ctx, W, H);
};

/** 猫咪详情弹窗 */
CatRoom.prototype._renderDetail = function (ctx, W, H) {
  var cat = this.detail;
  var t = CT.typeById(cat.typeId);
  var bd = Breeds.byId(cat.breedId);
  var rar = CT.RARITY[bd ? bd.rarity : t.rarity];
  ctx.fillStyle = 'rgba(60,40,30,0.5)';
  ctx.fillRect(0, 0, W, H);
  var pw = W * 0.84, ph = Math.min(430, H * 0.72), px = (W - pw) / 2, py = (H - ph) / 2;
  D.panel(ctx, px, py, pw, ph, '#FFF9EE');

  drawBreed(ctx, this.engine, Breeds.artOf(cat), cat.typeId,
    W / 2 - 60, py + 12, 120, 120, {
      t: rigTime(this), seed: Rig.seedOf(Breeds.artOf(cat)),
      happy: rigHappy(this), mode: 'full'
    });
  D.text(ctx, cat.name, W / 2, py + 148, 20, '#6A421F');
  D.text(ctx, rar.label + ' · ' + (Breeds.nameOf(bd) || CT.typeName(t)) + ' · Lv.' + cat.level, W / 2, py + 172, 13, rar.color);
  D.text(ctx, CT.typeDesc(t), W / 2, py + 192, 11, '#B09878');

  var bars = [[I.t('hunger'), cat.stats.hunger], [I.t('clean'), cat.stats.cleanliness], [I.t('happy'), cat.stats.happiness]];
  for (var b = 0; b < 3; b++) {
    var by = py + 214 + b * 24;
    D.text(ctx, bars[b][0], px + 80, by + 6, 12, '#8A6A52');
    ctx.fillStyle = '#EEE4D8';
    D.roundRect(ctx, px + 140, by, pw - 190, 12, 6); ctx.fill();
    ctx.fillStyle = Cats.statColor(bars[b][1]);
    D.roundRect(ctx, px + 140, by, (pw - 190) * bars[b][1] / 100, 12, 6); ctx.fill();
    D.text(ctx, Math.round(bars[b][1]), px + pw - 34, by + 6, 11, '#A09080');
  }
  if (cat.sickness) {
    var s = CT.SICKNESS[cat.sickness];
    D.text(ctx, I.t('sickDetail', { sick: CT.sickName(s), desc: CT.sickDesc(s) }), W / 2, py + 296, 13, '#E06060');
    D.text(ctx, I.t('cureNeed', { n: s.cost }), W / 2, py + 314, 12, '#A08060');
  }

  this.detailBtns = [
    { key: 'feed', text: I.t('feed'), x: px + 20, y: py + 330, w: (pw - 60) / 3, h: 44, color: '#F0A860', color2: '#FFC98E', fontSize: 14 },
    { key: 'wash', text: I.t('bath'), x: px + 20 + (pw - 60) / 3 + 10, y: py + 330, w: (pw - 60) / 3, h: 44, color: '#8FC7B4', color2: '#B2DDCE', fontSize: 14 },
    { key: 'playact', text: I.t('playAct'), x: px + 20 + (pw - 60) / 3 * 2 + 20, y: py + 330, w: (pw - 60) / 3, h: 44, color: '#A8B9DE', color2: '#C6D2EC', fontSize: 14 },
    { key: 'close', text: I.t('closeBtn'), x: px + 20, y: py + 384, w: pw - 40, h: 36, color: '#D8BFA4', color2: '#EBD8BF', fontSize: 14, textColor: '#7A4A20' }
  ];
  for (var d = 0; d < this.detailBtns.length; d++) D.button(ctx, this.detailBtns[d]);
};

/** 领养面板：分页列出所有有整猫原图的品种，选哪个就带回哪只 */
CatRoom.prototype._renderAdopt = function (ctx, W, H) {
  var pw = W * 0.92, ph = Math.min(H * 0.82, 640);
  var px = (W - pw) / 2, py = (H - ph) / 2;
  ctx.fillStyle = 'rgba(60,40,30,0.5)';
  ctx.fillRect(0, 0, W, H);
  D.panel(ctx, px, py, pw, ph, '#FFF9EE');

  // 猫屋为空时的第一只免费，保证「第一次进入 -> 领养 -> 选品种」一定能走通
  var free = Save.get('cats').length === 0;
  D.text(ctx, I.t('adoptBtn'), W / 2, py + 28, 20, '#C0703A');
  D.text(ctx, free ? I.t('adoptFreeFirst') : I.t('adoptPick'), W / 2, py + 52, 12, '#A09080');

  var pages = Math.ceil(Breeds.count / ADOPT_PER_PAGE);
  if (!(this.adoptPage >= 0)) this.adoptPage = 0;
  if (this.adoptPage > pages - 1) this.adoptPage = pages - 1;
  var list = Breeds.BREEDS.slice(this.adoptPage * ADOPT_PER_PAGE,
    (this.adoptPage + 1) * ADOPT_PER_PAGE);

  var gx = px + 14, gy = py + 68;
  var gw = pw - 28, gh = ph - 68 - 56;
  var cw = gw / ADOPT_COLS, ch = gh / 3;
  this.adoptBtns = [];
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    var r = {
      key: 'adopt_' + b.id, breedId: b.id,
      x: gx + (i % ADOPT_COLS) * cw + 3,
      y: gy + Math.floor(i / ADOPT_COLS) * ch + 3,
      w: cw - 6, h: ch - 6
    };
    this.adoptBtns.push(r);
    var col = CT.RARITY[b.rarity].color;
    ctx.fillStyle = '#FFFDF8';
    D.roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
    drawBreed(ctx, this.engine, Breeds.artPath(b), b.typeId,
      r.x + r.w * 0.10, r.y + 3, r.w * 0.80, r.h * 0.66, {
        t: rigTime(this), seed: Rig.seedOf(b.id) + i,
        happy: 0, mode: 'light'
      });
    var nm = Breeds.nameOf(b);
    D.text(ctx, nm, r.x + r.w / 2, r.y + r.h * 0.77,
      D.fit(nm, 12, r.w * 0.90), '#6A5242');
    D.text(ctx, CT.RARITY[b.rarity].label + ' · ' +
      (free ? I.t('adoptFree') : I.t('priceTag', { n: Breeds.priceOf(b) })),
      r.x + r.w / 2, r.y + r.h * 0.91, 10, col);
  }

  // 翻页 / 页码 / 关闭 同一行
  var ny = py + ph - 46;
  this.adoptBtns.push({ key: 'adoptPrev', text: '‹', x: px + 14, y: ny, w: 42, h: 34, color: '#D8BFA4', color2: '#EBD8BF', fontSize: 20, textColor: '#7A4A20' });
  this.adoptBtns.push({ key: 'adoptNext', text: '›', x: px + 60, y: ny, w: 42, h: 34, color: '#D8BFA4', color2: '#EBD8BF', fontSize: 20, textColor: '#7A4A20' });
  D.text(ctx, (this.adoptPage + 1) + ' / ' + pages, px + 138, ny + 17, 13, '#8A6A52');
  this.adoptBtns.push({ key: 'closeAdopt', text: I.t('closeBtn'), x: px + pw - 110, y: ny, w: 96, h: 34, color: '#D8BFA4', color2: '#EBD8BF', fontSize: 13, textColor: '#7A4A20' });
  for (var k = 0; k < this.adoptBtns.length; k++) {
    var bb = this.adoptBtns[k];
    if (bb.text) D.button(ctx, bb);
  }
};

/** 设置面板（咪窝页内就地打开，复用存档里的语言 / 音效开关） */
CatRoom.prototype._renderSettings = function (ctx, W, H) {
  ctx.fillStyle = 'rgba(60,40,30,0.48)';
  ctx.fillRect(0, 0, W, H);
  var pw = W * 0.80, ph = 210, px = (W - pw) / 2, py = (H - ph) / 2;
  D.panel(ctx, px, py, pw, ph, '#FFF9EE');
  D.text(ctx, I.t('setTitle'), W / 2, py + 30, 19, '#7A3D18');
  var langTxt = I.t('lang') + '：' + (I.lang() === 'en' ? 'English' : '简体中文');
  var musicTxt = I.t('music') + '：' + (Save.get('music') === false ? I.t('off') : I.t('on'));
  this.setBtns = [
    { key: 'lang', text: langTxt, x: px + 20, y: py + 58, w: pw - 40, h: 40, color: '#F3B268', color2: '#FFD39C', fontSize: 14, textColor: '#6A3A18' },
    { key: 'music', text: musicTxt, x: px + 20, y: py + 106, w: pw - 40, h: 40, color: '#9ACDBB', color2: '#BEE3D4', fontSize: 14, textColor: '#22584A' },
    { key: 'closeSettings', text: I.t('closeBtn'), x: px + 20, y: py + 156, w: pw - 40, h: 36, color: '#DCC4A8', color2: '#EFDDC6', fontSize: 14, textColor: '#7A4A20' }
  ];
  for (var i = 0; i < this.setBtns.length; i++) D.button(ctx, this.setBtns[i]);
};

// ---------------- 交互 ----------------
CatRoom.prototype.onTouchDown = function (x, y) {
  var press = function (arr) {
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) arr[i]._p = D.hit(arr[i], x, y);
  };
  if (this.detail) { press(this.detailBtns); return; }
  if (this.adoptSheet) { press(this.adoptBtns); return; }
  if (this.settingsOpen) { press(this.setBtns); return; }
  press(this.actionBtns); press(this.navBtns);
  press([this.settingsBtn, this.coinBtn, this.avatarBtn, this.cardBtn, this.catBtn, this.bubbleBtn]);
};

CatRoom.prototype._doAction = function (act, cat) {
  this._happyAt = rigTime(this);   // 喂食 / 玩耍 / 洗护 / 休息都触发开心反应
  var inv = Save.get('inventory');
  if (act === 'feed') {
    // 优先用高级粮
    var foodId = (inv.food_can || 0) > 0 ? 'food_can' : ((inv.food_pudding || 0) > 0 ? 'food_pudding' : 'food_basic');
    if ((inv[foodId] || 0) <= 0) { this.engine.toast(I.t('shopNoCoin')); return; }
    inv[foodId]--;
    Save.set('inventory', inv);
    var msg = Cats.feed(cat, Shop.byId(foodId));
    this.engine.float(this.engine.W / 2, this.engine.H * 0.42, msg, '#E08A3C', 20);
  } else if (act === 'wash') {
    var key = cat.id;
    var last = this.washCd[key] || 0;
    if (Date.now() - last < 30 * 60 * 1000 && cat.stats.cleanliness > 90) {
      this.engine.toast(I.t('justBath')); return;
    }
    this.washCd[key] = Date.now();
    var msg2 = Cats.wash(cat);
    this.engine.float(this.engine.W / 2, this.engine.H * 0.42, msg2, '#5AA9C8', 20);
  } else if (act === 'play' || act === 'playact') {
    var toyId = (inv.toy_ball || 0) > 0 ? 'toy_ball' : ((inv.toy_wand || 0) > 0 ? 'toy_wand' : 'toy_mint');
    var toy = Shop.byId(toyId);
    var msg3 = Cats.play(cat, toy);   // 玩具不消耗，每次消耗一点体力
    this.engine.float(this.engine.W / 2, this.engine.H * 0.42, msg3, '#D97BA0', 20);
  } else if (act === 'rest') {
    cat.stats.happiness = Math.min(100, (cat.stats.happiness || 0) + 8);
    cat.stats.cleanliness = Math.min(100, (cat.stats.cleanliness || 0) + 2);
    Cats.addExp(cat, 2);
    this.engine.float(this.engine.W / 2, this.engine.H * 0.42, I.t('restOk'), '#6E9FD0', 20);
    this.engine.burst(this.engine.W * 0.80, this.engine.H * 0.28, '#F58CA8', 10, { speed: 90, size: 4 });
  }
  Save.save();
};

CatRoom.prototype.onTouchUp = function (x, y) {
  var self = this;
  function release(arr, fn) {
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      b._p = false;
      if (D.hit(b, x, y) && fn) fn(b);
    }
  }

  if (this.detail) {
    release(this.detailBtns, function (b) {
      var cat = self.detail;
      if (b.key === 'close') { self.detail = null; return; }
      if (cat.sickness) { self.engine.toast(I.t('mustCure')); return; }
      self._doAction(b.key, cat);
    });
    return;
  }
  if (this.adoptSheet) {
    var pages = Math.ceil(Breeds.count / ADOPT_PER_PAGE);
    release(this.adoptBtns, function (b) {
      if (b.key === 'closeAdopt') { self.adoptSheet = false; self.adoptPage = 0; return; }
      if (b.key === 'adoptPrev') { self.adoptPage = Math.max(0, (self.adoptPage || 0) - 1); return; }
      if (b.key === 'adoptNext') { self.adoptPage = Math.min(pages - 1, (self.adoptPage || 0) + 1); return; }
      if (b.breedId) {
        var breed = Breeds.byId(b.breedId);
        if (!breed) return;
        var free = Save.get('cats').length === 0;
        var cost = free ? 0 : Breeds.priceOf(breed);
        if (cost && !Save.spendCoin(cost)) { self.engine.toast(I.t('noCoin')); return; }
        var cat = Save.buyCat(breed.typeId);   // typeId 决定属性衰减 / 图鉴
        cat.name = Breeds.nameOf(breed);       // 名字用品种名
        cat.breedId = breed.id;                // 决定咪窝上方显示哪张整猫立绘
        Save.save();                           // buyCat 之后又改了字段，再落盘一次
        self.adoptSheet = false;
        self.adoptPage = 0;
        self.detail = null;
        self.selCat = cat;
        self._happyAt = rigTime(self);   // 新猫进门先开心地蹦一下
        self.engine.toast(I.t('welcomeHome', { name: cat.name }));
      }
    });
    return;
  }
  if (this.settingsOpen) {
    release(this.setBtns, function (b) {
      if (b.key === 'closeSettings') { self.settingsOpen = false; return; }
      if (b.key === 'lang') {
        Save.set('lang', I.lang() === 'en' ? 'zh' : 'en');
        self.engine.toast(I.t('lang'));
      } else if (b.key === 'music') {
        Save.set('music', Save.get('music') === false);
      }
    });
    return;
  }

  release(this.actionBtns, function (b) {
    var cat = self.showCat();
    if (!cat) { self.adoptSheet = true; self.adoptPage = 0; return; }
    if (cat.sickness) { self.engine.toast(I.t('catSickGo', { name: cat.name })); return; }
    self.selCat = cat;
    self._doAction(b.key, cat);
  });
  release(this.navBtns, function (b) {
    if (b.key !== 'cats') self.engine.goto(b.key);
  });
  release([this.settingsBtn], function () { self.settingsOpen = true; });
  release([this.coinBtn], function () { self.engine.goto('shop'); });
  release([this.avatarBtn], function () { self.adoptSheet = true; self.adoptPage = 0; });
  release([this.cardBtn, this.catBtn], function () {
    var cat = self.showCat();
    self._happyAt = rigTime(self);   // 摸一下猫：眯眼 + 弹跳
    if (cat) self.detail = cat;
    else { self.adoptSheet = true; self.adoptPage = 0; }
  });
  release([this.bubbleBtn], function () {
    self._happyAt = rigTime(self);
    self.engine.burst(self.L.bubble.x + self.L.bubble.w / 2,
      self.L.bubble.y + self.L.bubble.h / 3, '#F4748C', 14, { speed: 110, size: 5 });
    self.engine.float(self.engine.W * 0.80, self.engine.H * 0.30, '♥', '#E8608A', 26);
  });
};

module.exports = CatRoom;
