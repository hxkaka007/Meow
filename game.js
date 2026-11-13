/** 咪头咪猫 - 小游戏入口 */
var Engine = require('./js/render.js');
var Home = require('./js/scenes/home.js');
var Home2 = require('./js/scenes/home2.js');
var CatRoom = require('./js/scenes/catroom.js');
var Shop = require('./js/scenes/shop.js');
var Hospital = require('./js/scenes/hospital.js');
var Play = require('./js/scenes/play.js');
var Bag = require('./js/scenes/bag.js');
var Task = require('./js/scenes/task.js');
var SelectLevel = require('./js/scenes/select.js');

var engine = new Engine();
engine.init();

engine.register('home', new Home());
engine.register('home2', new Home2());
engine.register('cats', new CatRoom());
engine.register('play', new Play());
engine.register('select', new SelectLevel());
engine.register('shop', new Shop());
engine.register('hospital', new Hospital());
engine.register('bag', new Bag());
engine.register('task', new Task());

// 引擎时间（供动画使用）
var _origUpdate = engine.update.bind(engine);
var _t = 0;
engine.update = function (dt) { _t += dt; engine.t = _t; _origUpdate(dt); };

engine.goto('home');

// 预加载全部图片资源（含养成美术）
engine.preload();

// 每日首次进入游戏：统一判重发放登录喵币 + 4 种道具各 1 个，
// 按「先喵币、后道具」顺序排队弹出两个弹窗（引擎层排队，互不覆盖）
var Save = require('./js/core/save.js');
var I = require('./js/core/i18n.js');
var Shop = require('./js/core/shop.js');
var A = require('./js/adapter.js');
function showDailyRewards() {
  var r = Save.claimDailyRewards();
  if (!r) return;
  engine.showModal({
    title: I.t('dailyCoinTitle'),
    desc: I.t('dailyCoinDesc', { n: r.coin }),
    items: [],
    foot: I.t('dailyCoinBag'),
    btnText: I.t('dailyGiftBtn')
  });
  var items = [];
  for (var i = 0; i < r.props.length; i++) {
    var it = Shop.propItem(r.props[i]);
    items.push({
      icon: 'prop_' + r.props[i],
      name: it ? Shop.nameOf(it) : r.props[i],
      count: 1
    });
  }
  engine.showModal({
    title: I.t('dailyGiftTitle'),
    desc: I.t('dailyGiftDesc'),
    items: items,
    foot: I.t('dailyGiftBag'),
    btnText: I.t('dailyGiftBtn')
  });
}
showDailyRewards();
// 从后台回到前台也视为一次进入，跨天时补发（同一天不会重复）
if (A.onShow) A.onShow(showDailyRewards);

// 调试句柄（预览用）
if (typeof window !== 'undefined') window.__engine = engine;

// 全局错误捕获（显示在画面上，便于真机排查）
if (typeof wx !== 'undefined') {
  if (wx.onError) wx.onError(function (msg) { engine._lastError = msg; });
  if (wx.onUnhandledRejection) wx.onUnhandledRejection(function (res) {
    engine._lastError = String((res && res.reason && (res.reason.message || res.reason)) || res);
  });
}

// 防熄屏
if (typeof wx !== 'undefined' && wx.setKeepScreenOn) {
  wx.setKeepScreenOn({ keepScreenOn: true });
}
