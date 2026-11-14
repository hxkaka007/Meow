/**
 * 无界面运行环境：在纯 Node 里模拟微信小游戏运行时。
 *
 * 零侵入的依据：js/adapter.js 只用 typeof wx !== 'undefined' && wx.getSystemInfoSync
 * 判断平台，平台调用几乎全部收口在该文件；渲染层只需要一个能吞掉所有绘制调用的 2D context。
 * 因此补一个假 wx + 假 canvas + 手动驱动的主循环，就能原样 require 根目录的 game.js。
 *
 * 本文件不修改任何游戏源码，所有能力都通过全局注入实现，测试结束可完整 restore。
 */
'use strict';

var REAL_DATE = Date;
var REAL_RANDOM = Math.random;

/** mulberry32：同一种子必然产生同一串 [0,1) 随机数，用于让关卡/动画可复现 */
function makeRandom(seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 可控时钟：Date.now() 与 new Date() 都读同一个值，step() 按帧推进 */
function makeClock(startMs) {
  var clock = { now: startMs };
  var FakeDate = class extends REAL_DATE {
    constructor() {
      var args = arguments.length ? Array.prototype.slice.call(arguments) : [clock.now];
      super(...args);
    }
    static now() { return clock.now; }
  };
  clock.Date = FakeDate;
  clock.advance = function (ms) { clock.now += ms; };
  clock.set = function (ms) { clock.now = ms; };
  clock.install = function () { global.Date = FakeDate; };
  clock.restore = function () { if (global.Date === FakeDate) global.Date = REAL_DATE; };
  return clock;
}

function seedRandom(seed) {
  Math.random = makeRandom(seed);
  return function restore() { Math.random = REAL_RANDOM; };
}

/** 假 2D context：所有绘制方法都是 no-op，渐变 / 文本测量返回结构合法的值 */
function makeCanvas() {
  var c = { width: 0, height: 0 };
  var noop = function () { };
  var props = {};
  var ctx = new Proxy(props, {
    get: function (t, k) {
      if (typeof k === 'symbol') return undefined;
      if (k === 'canvas') return c;
      if (k === 'measureText') {
        return function (s) { return { width: String(s == null ? '' : s).length * 8 }; };
      }
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') {
        return function () { return { addColorStop: noop }; };
      }
      if (k === 'getImageData') {
        return function (x, y, w, h) {
          var W = Math.max(0, w | 0), H = Math.max(0, h | 0);
          return { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
        };
      }
      if (Object.prototype.hasOwnProperty.call(t, k)) return t[k];
      return noop;
    },
    set: function (t, k, v) { t[k] = v; return true; }
  });
  c.getContext = function () { return ctx; };
  c.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: c.width, height: c.height, right: c.width, bottom: c.height };
  };
  c.addEventListener = noop;
  c.removeEventListener = noop;
  return c;
}

/** 假图片：赋值 src 即同步触发 onload（或 onerror），让 engine.preload() 立刻完成 */
function makeImage(env, opts) {
  var w = opts.imageWidth || 64, h = opts.imageHeight || 64;
  var im = { width: w, height: h, naturalWidth: w, naturalHeight: h, complete: true };
  Object.defineProperty(im, 'src', {
    configurable: true,
    get: function () { return im._src; },
    set: function (v) {
      im._src = v;
      if (env.imageFail) { if (im.onerror) im.onerror(); }
      else if (im.onload) im.onload();
    }
  });
  return im;
}

/**
 * 安装假运行时。opts:
 *   seed / now / width / height / dpr / safeTop  确定性参数
 *   imageFail   让所有图片加载失败，用于验证兜底渲染
 *   quiet       默认 true，收集 console 输出而不打印（便于机器读 JSON）
 */
function installEnv(opts) {
  opts = opts || {};
  var env = {
    opts: opts,
    storage: new Map(),
    logs: [],
    errors: [],
    handlers: {},
    raf: null,
    timers: [],
    imageFail: !!opts.imageFail,
    subpackageFail: !!opts.subpackageFail,
    seed: opts.seed === undefined ? 20260101 : opts.seed,
    width: opts.width || 375,
    height: opts.height || 667,
    dpr: opts.dpr || 2,
    clock: makeClock(opts.now === undefined ? REAL_DATE.parse('2026-01-01T12:00:00+08:00') : opts.now)
  };
  var quiet = opts.quiet !== false;
  var noop = function () { };
  var timerId = 0;
  var intervals = new Map();
  env.intervals = intervals;

  var saved = {
    wx: global.wx, hasWx: 'wx' in global,
    window: global.window, hasWindow: 'window' in global,
    Image: global.Image, hasImage: 'Image' in global,
    raf: global.requestAnimationFrame, caf: global.cancelAnimationFrame,
    setTimeout: global.setTimeout, clearTimeout: global.clearTimeout,
    setInterval: global.setInterval, clearInterval: global.clearInterval,
    console: { log: console.log, info: console.info, warn: console.warn, error: console.error }
  };

  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    console[level] = function () {
      var msg = Array.prototype.map.call(arguments, function (a) {
        return (a && a.stack) ? a.stack : String(a);
      }).join(' ');
      env.logs.push({ level: level, msg: msg });
      if (level === 'error') env.errors.push(msg);
      if (!quiet) saved.console[level].apply(console, arguments);
    };
  });

  global.window = globalThis;   // game.js: if (typeof window !== 'undefined') window.__engine = engine
  global.wx = {
    getSystemInfoSync: function () {
      return {
        windowWidth: env.width, windowHeight: env.height,
        screenWidth: env.width, screenHeight: env.height,
        pixelRatio: env.dpr,
        safeArea: { top: opts.safeTop || 0, bottom: env.height, left: 0, right: env.width }
      };
    },
    createCanvas: function () { return makeCanvas(); },
    createImage: function () { return makeImage(env, opts); },
    getStorageSync: function (k) {
      return env.storage.has(k) ? JSON.parse(JSON.stringify(env.storage.get(k))) : '';
    },
    setStorageSync: function (k, v) {
      env.storage.set(k, v === undefined ? null : JSON.parse(JSON.stringify(v)));
    },
    getMenuButtonBoundingClientRect: function () {
      return { top: 20, bottom: 52, left: env.width - 97, right: env.width - 10, width: 87, height: 32 };
    },
    onTouchStart: function (fn) { env.handlers.touchStart = fn; },
    onTouchMove: function (fn) { env.handlers.touchMove = fn; },
    onTouchEnd: function (fn) { env.handlers.touchEnd = fn; },
    onTouchCancel: function (fn) { env.handlers.touchCancel = fn; },
    onShow: function (fn) { env.handlers.onShow = fn; },
    onHide: function (fn) { env.handlers.onHide = fn; },
    onError: function (fn) { env.handlers.onError = fn; },
    onUnhandledRejection: function (fn) { env.handlers.onUnhandledRejection = fn; },
    setKeepScreenOn: noop,
    exitMiniProgram: noop,
    // subpackageFail 打开时走 fail 分支，用于覆盖分包下载失败路径
    loadSubpackage: function (o) {
      if (env.subpackageFail) { if (o && o.fail) o.fail({ errMsg: 'loadSubpackage:fail (test)' }); }
      else if (o && o.success) o.success();
    }
  };
  global.Image = function () { return makeImage(env, opts); };

  // 主循环不自动跑：只记下回调，由 harness.step() 逐帧驱动
  global.requestAnimationFrame = function (fn) { env.raf = fn; return ++timerId; };
  global.cancelAnimationFrame = noop;

  function runTimer(t) {
    try { t.fn(); } catch (e) { env.errors.push('[timer] ' + (e.stack || e)); }
  }

  global.setTimeout = function (fn, delay) {
    var id = ++timerId;
    env.timers.push({ id: id, fn: fn, due: env.clock.now + (Number(delay) || 0) });
    return id;
  };
  global.clearTimeout = function (id) {
    env.timers = env.timers.filter(function (t) { return t.id !== id; });
  };
  // interval 只注册、不自动跑：由 step() 按虚拟时钟触发，或 boot() 里 drainIntervals() 排空
  global.setInterval = function (fn, delay) {
    var id = ++timerId;
    var d = Number(delay) || 100;
    intervals.set(id, { fn: fn, delay: d, next: env.clock.now + d });
    return id;
  };
  global.clearInterval = function (id) { intervals.delete(id); };

  /** 执行所有到期的 setTimeout，由 Harness.step() 每帧调用，语义与真机一致 */
  env.tickTimers = function () {
    var guard = 0;
    while (guard++ < 500) {
      var due = null;
      for (var i = 0; i < env.timers.length; i++) {
        if (env.timers[i].due <= env.clock.now && (!due || env.timers[i].due < due.due)) due = env.timers[i];
      }
      if (!due) break;
      env.timers.splice(env.timers.indexOf(due), 1);
      runTimer(due);
    }
  };

  /** 执行所有到期的 setInterval；回调内 clearInterval(id) 会按 id 立即生效 */
  env.tickIntervals = function () {
    var guard = 0;
    while (guard++ < 200) {
      var due = null, dueId = null;
      intervals.forEach(function (it, id) {
        if (it.next <= env.clock.now && (!due || it.next < due.next)) { due = it; dueId = id; }
      });
      if (!due) break;
      due.next += due.delay;
      try { due.fn(); } catch (e) {
        env.errors.push('[interval] ' + (e.stack || e));
        intervals.delete(dueId);
      }
    }
  };

  /**
   * 仅用于 boot()：启动期 preload 轮询必须排空，否则 missingAssets 不会有值。
   * 故意不推进业务时钟（preload 的 waited 自行累加），避免 Date.now() 被偷偷推走。
   */
  env.drainIntervals = function (maxTicks) {
    var limit = maxTicks || 200, n = 0;
    while (intervals.size && n++ < limit) {
      Array.from(intervals.entries()).forEach(function (entry) {
        var id = entry[0], it = entry[1];
        if (!intervals.has(id)) return;
        it.next += it.delay;
        try { it.fn(); } catch (e) {
          env.errors.push('[interval] ' + (e.stack || e));
          intervals.delete(id);
        }
      });
    }
    return n;
  };

  /** 显式跳过等待、立即执行所有排队的 setTimeout（YAML 的「执行定时器」动作） */
  env.flushTimers = function () {
    var list = env.timers.slice().sort(function (a, b) { return a.due - b.due; });
    env.timers = [];
    list.forEach(runTimer);
  };

  env.clock.install();
  Math.random = makeRandom(env.seed);

  env.restore = function () {
    Math.random = REAL_RANDOM;
    intervals.clear();
    env.timers.length = 0;
    env.clock.restore();
    if (saved.hasWx) global.wx = saved.wx; else delete global.wx;
    if (saved.hasWindow) global.window = saved.window; else delete global.window;
    if (saved.hasImage) global.Image = saved.Image; else delete global.Image;
    global.requestAnimationFrame = saved.raf;
    global.cancelAnimationFrame = saved.caf;
    global.setTimeout = saved.setTimeout;
    global.clearTimeout = saved.clearTimeout;
    global.setInterval = saved.setInterval;
    global.clearInterval = saved.clearInterval;
    ['log', 'info', 'warn', 'error'].forEach(function (level) { console[level] = saved.console[level]; });
    delete globalThis.__engine;
  };

  return env;
}

module.exports = { installEnv: installEnv, makeRandom: makeRandom, makeClock: makeClock, seedRandom: seedRandom };
