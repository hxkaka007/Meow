/**
 * 存档（users 集合本地版）——GDD 第七章经济 + 第十四章存档设计
 */
var A = require('../adapter.js');
var Cats = require('./cats.js');
var CT = require('./catTypes.js');
var Shop = require('./shop.js');

var KEY = 'catlink_save_v2';

var defaults = {
  version: 2,
  maxLevel: 1,
  coin: 300,          // 喵币
  diamond: 0,
  bestScore: 0,
  totalElim: 0,
  cats: [],           // 猫咪实例数组
  homes: [{ id: 'home_1', name: '阳光小窝', nameKey: 'homeSun' }],
  furniture: [],      // 已购买家具 itemId
  inventory: {        // 背包装备（食物/玩具计数）
    food_basic: 3,
    toy_mint: 1
  },
  props: { hint: 1, shuffle: 1, bomb: 1, time: 1 },
  lastLoginDay: '',
  dailyGiftDay: '',   // 每日奖励已发放的日期（本地日期，见 claimDailyRewards）
  adCount: 0,
  shareCount: 0,
  activityCoupon: false,
  achievements: {},    // 成就解锁
  unlockedTypes: ['ju', 'bei'], // 已解锁品种
  theme: 'cream',      // 主题皮肤 id（core/theme.js）
  decor: true,         // 背景爪印装饰开关
  music: true,         // 背景音效开关（设置面板）
  lang: 'zh',          // 语言 'zh' | 'en'（core/i18n.js）
  homeStyle: 'classic', // 主页风格 'classic' 经典 | 'cozy' 温馨小屋（js/scenes/home2.js）
  totalPlaySec: 0,
  daily: null          // 每日任务进度（core/tasks.js 维护）
};

var Save = {
  data: null,

  load: function () {
    if (!this.data) {
      this.data = A.getStorage(KEY, null);
      if (!this.data) {
        var old = A.getStorage('catlink_save_v1', null);
        this.data = JSON.parse(JSON.stringify(defaults));
        if (old) {
          this.data.maxLevel = old.maxLevel || 1;
          this.data.bestScore = old.bestScore || 0;
          this.data.coin = (old.coins || 0) + 300;
        }
        this.data = this._migrate(this.data);
        this.save();
      } else {
        this.data = this._migrate(this.data);
      }
    }
    return this.data;
  },

  _migrate: function (d) {
    for (var k in defaults) {
      if (d[k] === undefined) d[k] = JSON.parse(JSON.stringify(defaults[k]));
    }
    // 道具背包：逐键补齐并钳制为非负整数，避免老档/损坏档出现 undefined、NaN 或负数
    if (!d.props || typeof d.props !== 'object') d.props = {};
    for (var p = 0; p < Shop.PROP_KEYS.length; p++) {
      var pk = Shop.PROP_KEYS[p];
      var n = Number(d.props[pk]);
      d.props[pk] = isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
    for (var i = 0; i < d.cats.length; i++) {
      var c = d.cats[i];
      if (!c.stats) c.stats = { hunger: 80, cleanliness: 80, happiness: 80 };
      if (c.sickness === undefined) c.sickness = null;
      if (!c.homeId) c.homeId = 'home_1';
    }
    return d;
  },

  save: function () { A.setStorage(KEY, this.data); },
  get: function (k) { return this.load()[k]; },
  set: function (k, v) { this.load()[k] = v; this.save(); },

  // ---------------- 喵币 ----------------
  addCoin: function (n) {
    this.load();
    this.data.coin = Math.max(0, this.data.coin + n);
    this.save();
    return this.data.coin;
  },
  spendCoin: function (n) {
    this.load();
    n = Number(n);
    if (!isFinite(n) || n <= 0 || this.data.coin < n) return false;
    this.data.coin -= n;
    this.save();
    return true;
  },

  // ---------------- 猫咪 ----------------
  catsInHome: function (homeId) {
    this.load();
    var out = [];
    for (var i = 0; i < this.data.cats.length; i++)
      if (this.data.cats[i].homeId === homeId) out.push(this.data.cats[i]);
    return out;
  },

  buyCat: function (typeId) {
    this.load();
    var t = CT.typeById(typeId);
    var homeId = this.data.homes[0].id;
    for (var h = 0; h < this.data.homes.length; h++) {
      if (this.catsInHome(this.data.homes[h].id).length < 3) { homeId = this.data.homes[h].id; break; }
    }
    var cat = Cats.createCat(typeId, CT.typeName(t), homeId);   // 新猫名跟当前语言
    this.data.cats.push(cat);
    this.save();
    return cat;
  },

  /** 家具加成（按已购家具聚合） */
  furnitureBonus: function () {
    this.load();
    var fb = { hungerRate: 0, cleanRate: 0, happyRate: 0 };
    for (var i = 0; i < this.data.furniture.length; i++) {
      var it = Shop.byId(this.data.furniture[i]);
      if (it && fb[it.effectType] !== undefined) fb[it.effectType] += it.effectValue;
    }
    return fb;
  },

  // ---------------- 每日 ----------------
  todayKey: function () {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  },

  /**
   * 每日首次进入游戏：一次性发放登录喵币 + 4 种道具各 1 个。
   * 用 dailyGiftDay 单次判重，返回 { coin, props }；当天已领取返回 null。
   */
  claimDailyRewards: function () {
    this.load();
    var today = this.todayKey();
    if (this.data.dailyGiftDay === today) return null;
    this.data.dailyGiftDay = today;
    this.data.lastLoginDay = today;
    this.data.adCount = 0;
    this.data.shareCount = 0;
    var coin = 100 + Math.min(200, this.data.maxLevel * 4);
    this.data.coin += coin;
    if (!this.data.props || typeof this.data.props !== 'object') this.data.props = {};
    for (var i = 0; i < Shop.PROP_KEYS.length; i++) {
      var key = Shop.PROP_KEYS[i];
      this.data.props[key] = (Number(this.data.props[key]) || 0) + 1;
    }
    this.save();
    return { coin: coin, props: Shop.PROP_KEYS.slice() };
  },

  /** 过关结算：喵币产出（GDD 7.2）。重玩已通关关卡不发币、不推进进度 */
  onWin: function (levelId, score, timeLeft, stepsLeft, combo) {
    this.load();
    var replay = levelId < this.data.maxLevel;
    var coinBonus = 0;
    for (var i = 0; i < this.data.cats.length; i++) {
      coinBonus += CT.typeById(this.data.cats[i].typeId).coinBonus || 0;
    }
    coinBonus = Math.min(0.5, coinBonus);

    var base = Math.round((50 + Math.min(150, levelId * 5)) * (1 + coinBonus));
    var comboReward = Math.min(100, (combo || 0) * 10);
    var leftReward = Math.min(50, Math.round(timeLeft || stepsLeft || 0));
    var total = replay ? 0 : base + comboReward + leftReward;

    if (!replay && levelId >= this.data.maxLevel) {
      this.data.maxLevel = levelId + 1;
      for (var t = 0; t < CT.CAT_TYPES.length; t++) {
        var tp = CT.CAT_TYPES[t];
        if (tp.unlockMethod === 'levelUp' && this.data.maxLevel >= tp.unlockLevel &&
            this.data.unlockedTypes.indexOf(tp.typeId) < 0) {
          this.data.unlockedTypes.push(tp.typeId);
        }
      }
    }
    if (score > this.data.bestScore) this.data.bestScore = score;
    if (!replay) this.data.coin += total;
    this.save();
    return { total: total, base: base, combo: comboReward, left: leftReward, coinBonus: coinBonus, replay: replay };
  },

  /** 看广告/分享奖励 */
  rewardAd: function () {
    this.load();
    if (this.data.adCount >= 5) return 0;
    this.data.adCount++;
    this.data.coin += 200;
    this.save();
    return 200;
  },
  rewardShare: function () {
    this.load();
    if (this.data.shareCount >= 3) return 0;
    this.data.shareCount++;
    this.data.coin += 50;
    this.save();
    return 50;
  },

  /** 活动解锁三花猫 */
  claimActivityCat: function () {
    this.load();
    if (this.data.unlockedTypes.indexOf('sanhua') >= 0) return null;
    this.data.unlockedTypes.push('sanhua');
    this.data.activityCoupon = true;
    this.save();
    return 'sanhua';
  },

  /** 购买咪窝 */
  addHome: function (name) {
    this.load();
    var id = 'home_' + (this.data.homes.length + 1);
    this.data.homes.push({
      id: id, name: name || ('小窝 ' + (this.data.homes.length + 1)),
      nameKey: 'homeNum', num: this.data.homes.length + 1
    });
    this.save();
    return id;
  },

  /** 给所有猫咪补算衰减（每帧调用开销低，走时间差判断） */
  tickAll: function () {
    this.load();
    var fb = this.furnitureBonus();
    var sick = [];
    for (var i = 0; i < this.data.cats.length; i++) {
      var r = Cats.tick(this.data.cats[i], Date.now(), fb);
      if (r.gotSick && this.data.cats[i].sickness) sick.push(this.data.cats[i]);
    }
    if (sick.length) this.save();
    return sick;
  }
};

module.exports = Save;
