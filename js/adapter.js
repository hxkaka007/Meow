/**
 * 适配层：统一 wx / 浏览器预览 差异
 */
var isWx = typeof wx !== 'undefined' && !!wx.getSystemInfoSync;

var adapter = {
  isWx: isWx,
  winW: 375,
  winH: 667,
  dpr: 2,
  /** 顶部安全区（灵动岛 / 刘海 / 状态栏），真机取 wx.safeArea.top，预览可用 window.__SAFE_TOP 模拟 */
  safeTop: 0,

  init: function () {
    this.safeTop = 0;
    if (isWx) {
      var info = wx.getSystemInfoSync();
      this.winW = info.windowWidth || info.screenWidth;
      this.winH = info.windowHeight || info.screenHeight;
      this.dpr = Math.min(info.pixelRatio || 2, 3);
      var sa = info.safeArea || info.windowSafeArea;
      if (sa && typeof sa.top === 'number') this.safeTop = Math.max(0, sa.top);
      this.canvas = wx.createCanvas();
    } else {
      this.canvas = document.getElementById('game');
      var fs = window.__FORCE_SIZE;   // 预览页可通过 ?w=&h= 强制逻辑尺寸（无头截图用）
      this.winW = (fs && fs.w) || window.innerWidth || 414;
      this.winH = (fs && fs.h) || window.innerHeight || 896;
      this.dpr = Math.min(window.devicePixelRatio || 2, 2);
      this.safeTop = Math.max(0, window.__SAFE_TOP || 0);
    }
    this.canvas.width = this.winW * this.dpr;
    this.canvas.height = this.winH * this.dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(this.dpr, this.dpr);
  },

  // ---------------- 存储 ----------------
  getStorage: function (key, def) {
    try {
      if (isWx) {
        var v = wx.getStorageSync(key);
        return v === '' || v === undefined || v === null ? def : v;
      }
      var raw = localStorage.getItem(key);
      return raw === null ? def : JSON.parse(raw);
    } catch (e) { return def; }
  },
  setStorage: function (key, val) {
    try {
      if (isWx) wx.setStorageSync(key, val);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { }
  },

  // ---------------- 音效（WebAudio 合成，无外部资源） ----------------
  _audioCtx: null,
  _ensureAudio: function () {
    if (this._audioCtx) return this._audioCtx;
    try {
      if (isWx && wx.createWebAudioContext) this._audioCtx = wx.createWebAudioContext();
      else if (!isWx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { }
    return this._audioCtx;
  },
  beep: function (freq, dur, type, vol, when) {
    // 音乐开关（设置面板"背景音效"）：关闭时不发出任何声音
    try {
      var Save = require('./core/save.js');
      if (Save.get('music') === false) return;
    } catch (e) { }
    var ac = this._ensureAudio();
    if (!ac) return;
    try {
      var t0 = ac.currentTime + (when || 0);
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(vol || 0.15, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch (e) { }
  },
  sfx: function (name) {
    switch (name) {
      case 'select': this.beep(660, 0.08, 'sine', 0.12); break;
      case 'match':
        this.beep(523, 0.09, 'sine', 0.14);
        this.beep(784, 0.12, 'sine', 0.14, 0.07);
        break;
      case 'combo':
        this.beep(659, 0.08, 'triangle', 0.13);
        this.beep(880, 0.1, 'triangle', 0.13, 0.06);
        this.beep(1318, 0.14, 'triangle', 0.12, 0.12);
        break;
      case 'error': this.beep(180, 0.18, 'square', 0.08); break;
      case 'ice': this.beep(1400, 0.06, 'square', 0.06); this.beep(900, 0.08, 'square', 0.05, 0.04); break;
      case 'chain': this.beep(320, 0.1, 'sawtooth', 0.08); break;
      case 'bomb':
        this.beep(120, 0.3, 'sawtooth', 0.2);
        this.beep(80, 0.4, 'square', 0.15, 0.05);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach(function (f, i) { adapter.beep(f, 0.16, 'sine', 0.15, i * 0.13); });
        break;
      case 'lose':
        [400, 340, 280, 200].forEach(function (f, i) { adapter.beep(f, 0.2, 'sine', 0.12, i * 0.16); });
        break;
      case 'flip': this.beep(500, 0.06, 'sine', 0.1); break;
      case 'shuffle': this.beep(700, 0.05, 'sine', 0.1); this.beep(600, 0.05, 'sine', 0.1, 0.06); this.beep(500, 0.05, 'sine', 0.1, 0.12); break;
    }
  },

  // ---------------- 图片加载 ----------------
  /** 只对非 ASCII 字符做百分号编码，保留 / . - _ 等路径结构字符 */
  encodePath: function (p) {
    return String(p).replace(/[^\x20-\x7E]/g, function (ch) {
      return encodeURIComponent(ch);
    });
  },

  /**
   * 加载图片，自动尝试多种路径写法（相对 / 绝对 / URI 编码），全部失败才 cb(null)
   * 微信小游戏对中文路径与相对路径的容忍度不一致，这里统一兜住
   */
  loadImage: function (path, cb) {
    var self = this;
    var cands = [];
    function push(p) {
      var e = self.encodePath(p);
      if (cands.indexOf(e) < 0) cands.push(e);
    }
    push(path);
    push(path.indexOf('/') === 0 ? path.slice(1) : '/' + path);

    var i = 0;
    function next() {
      if (i >= cands.length) {
        if (typeof console !== 'undefined' && console.warn)
          console.warn('[img] load failed: ' + path);
        cb(null);
        return;
      }
      var p = cands[i++];
      if (self.isWx) {
        var img = wx.createImage();
        img.onload = function () { cb(img); };
        img.onerror = function () { next(); };
        img.src = p;
      } else {
        var im = new Image();
        im.onload = function () { cb(im); };
        im.onerror = function () { next(); };
        im.src = p;
      }
    }
    next();
  },

  // ---------------- 生命周期 ----------------
  onShow: function (fn) { if (isWx) wx.onShow(fn); else window.addEventListener('focus', fn); },
  onHide: function (fn) {
    if (isWx) wx.onHide(fn);
    else window.addEventListener('blur', fn);
  },
  exitGame: function () { if (isWx && wx.exitMiniProgram) wx.exitMiniProgram(); },
  setKeepScreenOn: function () { if (isWx && wx.setKeepScreenOn) wx.setKeepScreenOn({ keepScreenOn: true }); },

  // ---------------- 分包加载 ----------------
  /**
   * 触发分包下载（微信小游戏 wx.loadSubpackage）。
   * 浏览器预览 / 基础库不支持时立即回调 cb(true)，逻辑不受影响。
   */
  loadSubpackage: function (name, cb) {
    if (!isWx || !wx.loadSubpackage) { if (cb) cb(true); return; }
    try {
      wx.loadSubpackage({
        name: name,
        success: function () { if (cb) cb(true); },
        fail: function (err) {
          if (typeof console !== 'undefined' && console.warn)
            console.warn('[subpkg] load fail: ' + name, err);
          if (cb) cb(false);
        }
      });
    } catch (e) { if (cb) cb(false); }
  }
};

module.exports = adapter;
