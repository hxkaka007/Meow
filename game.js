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

var engine = new Engine();
engine.init();

engine.register('home', new Home());
engine.register('home2', new Home2());
engine.register('cats', new CatRoom());
engine.register('play', new Play());
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
