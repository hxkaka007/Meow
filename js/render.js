/**
 * 渲染引擎：主循环 / 场景栈 / 触摸分发 / 粒子与飘字
 */
var A = require('./adapter.js');
var D = require('./ui/draw.js');
var S = require('./core/sprites.js');
var Theme = require('./core/theme.js');

function Engine() {
  this.scenes = {};
  this.stack = [];       // 场景栈
  this.particles = [];   // 全局粒子
  this.floaters = [];    // 飘字
  this.toastMsg = null;
  this.toastT = 0;
  this.lastT = 0;
  this.shakeT = 0;
  this._lastError = null;
  this.modal = null;          // 全局模态弹窗（覆盖所有场景）
  this._modalBtn = null;
  this._modalRect = null;
  this._modalPress = false;
}

/**
 * 全局模态弹窗：opts = { title, desc, items: [{icon, name, count}], foot, btnText, onClose }
 * 绘制在最上层并独占触摸输入，出现期间暂停场景逻辑（含关卡计时）。
 * 同时打开多个时按调用顺序排队，关闭当前后自动显示下一个。
 */
Engine.prototype.showModal = function (opts) {
  if (!opts) return;
  if (this.modal) { (this._modalQueue = this._modalQueue || []).push(opts); return; }
  this.modal = opts;
  this._modalBtn = null;
  this._modalPress = false;
};

Engine.prototype.closeModal = function () {
  var m = this.modal;
  var q = this._modalQueue = this._modalQueue || [];
  this.modal = q.length ? q.shift() : null;
  this._modalBtn = null;
  this._modalPress = false;
  if (m && m.onClose) m.onClose();
};

Engine.prototype._renderModal = function (ctx) {
  var m = this.modal, W = this.W, H = this.H;
  var pw = Math.min(W * 0.82, 340);
  var items = m.items || [];
  var cols = items.length > 2 ? 2 : Math.max(1, items.length);
  var gap = 12, cardH = 88;
  var cw = Math.min(120, (pw - 36 - gap * (cols - 1)) / cols);
  var rows = Math.ceil(items.length / cols);
  var gridTop = 96;
  var gridH = rows ? rows * cardH + (rows - 1) * gap : 0;
  var footY = gridTop + gridH + (rows ? 16 : 4);
  var btnY = footY + 34;
  var ph = btnY + 44 + 22;
  var px = (W - pw) / 2, py = (H - ph) / 2;
  this._modalRect = { x: px, y: py, w: pw, h: ph };

  ctx.fillStyle = 'rgba(90,60,40,0.45)';
  ctx.fillRect(0, 0, W, H);
  D.panel(ctx, px, py, pw, ph, '#FFF9EF');
  ctx.strokeStyle = '#EFA863';
  ctx.lineWidth = 3;
  D.roundRect(ctx, px, py, pw, ph, 18);
  ctx.stroke();

  D.text(ctx, m.title || '', W / 2, py + 40, 23, '#B96A33');
  D.label(ctx, m.desc || '', W / 2, py + 74, 13, '#8A5A3B', { maxW: pw - 36, bold: false });

  var totalW = cols * cw + (cols - 1) * gap;
  var sx = W / 2 - totalW / 2;
  for (var i = 0; i < items.length; i++) {
    var col = i % cols, row = Math.floor(i / cols);
    var cx = sx + col * (cw + gap), cy = py + gridTop + row * (cardH + gap);
    ctx.fillStyle = '#FFF0DF';
    D.roundRect(ctx, cx, cy, cw, cardH, 14);
    ctx.fill();
    if (!this.drawIcon(ctx, items[i].icon, cx + cw / 2 - 24, cy + 6, 48, 48)) {
      D.text(ctx, '?', cx + cw / 2, cy + 30, 22, '#C38A5B');
    }
    D.label(ctx, items[i].name || '', cx + cw / 2, cy + 64, 15, '#8A5A3B', { maxW: cw - 8 });
    D.text(ctx, '+' + (items[i].count || 1), cx + cw / 2, cy + 80, 13, '#E07A3C');
  }

  D.label(ctx, m.foot || '', W / 2, py + footY, 13, '#A98A70', { maxW: pw - 36, bold: false });
  var btn = {
    x: W / 2 - 90, y: py + btnY, w: 180, h: 44,
    text: m.btnText || 'OK', color: '#F2934A', color2: '#FFC77C',
    textColor: '#fff', fontSize: 18
  };
  btn._pressed = this._modalPress;
  D.button(ctx, btn, 0);
  this._modalBtn = btn;
};

Engine.prototype.init = function () {
  A.init();
  this.ctx = A.ctx;
  this.W = A.winW;
  this.H = A.winH;
  this._bindInput();
  var self = this;
  function loop(ts) {
    requestAnimationFrame(loop); // 先调度下一帧，任何异常都不会中断主循环
    try {
      var dt = Math.min((ts - self.lastT) / 1000 || 0.016, 0.05);
      self.lastT = ts;
      self.update(dt);
      self.render();
    } catch (err) {
      self._lastError = (err && (err.stack || err.message)) || String(err);
      console.error('[loop]', err);
    }
  }
  requestAnimationFrame(loop);
};

Engine.prototype.register = function (name, scene) {
  scene.engine = this;
  this.scenes[name] = scene;
};

Engine.prototype.goto = function (name, params) {
  // 主页风格路由：'home' 是逻辑入口，按存档里的风格设置分发到具体场景
  if (name === 'home' || name === 'home2') {
    var Save = require('./core/save.js');
    name = Save.get('homeStyle') === 'cozy' ? 'home2' : 'home';
  }
  var s = this.scenes[name];
  if (this.current && this.current.onHide) this.current.onHide();
  this.current = s;
  this.stack = [name];
  if (s.onShow) s.onShow(params);
};

Engine.prototype.push = function (name, params) {
  var s = this.scenes[name];
  if (this.current && this.current.onHide) this.current.onHide();
  this.current = s;
  this.stack.push(name);
  if (s.onShow) s.onShow(params);
};

Engine.prototype.pop = function () {
  if (this.stack.length <= 1) return;
  if (this.current && this.current.onHide) this.current.onHide();
  this.stack.pop();
  var name = this.stack[this.stack.length - 1];
  this.current = this.scenes[name];
  if (this.current.onShow) this.current.onShow();
};

// ---------------- 特效 ----------------
Engine.prototype.burst = function (x, y, color, n, opts) {
  opts = opts || {};
  for (var i = 0; i < (n || 12); i++) {
    var ang = Math.random() * Math.PI * 2;
    var sp = (opts.speed || 160) * (0.4 + Math.random() * 0.8);
    this.particles.push({
      x: x, y: y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60,
      life: (opts.life || 0.7) * (0.6 + Math.random() * 0.6),
      t: 0, size: (opts.size || 5) * (0.6 + Math.random() * 0.8),
      color: color, star: !!opts.star, g: opts.g === undefined ? 420 : opts.g
    });
  }
};

Engine.prototype.float = function (x, y, text, color, size) {
  this.floaters.push({ x: x, y: y, text: text, color: color || '#ff8899', size: size || 22, t: 0, life: 1.1 });
};

Engine.prototype.toast = function (msg) {
  this.toastMsg = msg;
  this.toastT = 1.6;
};

/** 图片缓存键（浏览器预览加 /catlink/ 前缀，微信用原始路径） */
Engine.prototype._key = function (p) {
  return (p.indexOf('assets') === 0 && !A.isWx) ? '/catlink/' + p : p;
};

/** 图片缓存加载（加载失败会自动重试，避免首帧未就绪导致长期兜底） */
Engine.prototype.img = function (path) {
  var cache = this._imgs = this._imgs || {};
  var key = this._key(path);
  if (cache[key] !== undefined) return cache[key];
  cache[key] = null;
  this._loadImg(key, 0);
  return cache[key];
};

Engine.prototype._loadImg = function (path, attempt) {
  var self = this;
  A.loadImage(path, function (im) {
    if (im) { self._imgs[path] = im; return; }
    // 失败重试 3 次（间隔递增），真机偶发加载失败时仍能恢复
    if (attempt < 3) {
      var delay = 400 * (attempt + 1);
      if (typeof setTimeout === 'function')
        setTimeout(function () { self._loadImg(path, attempt + 1); }, delay);
    }
  });
};

// ---------------- 雪碧图 ----------------
/** 取雪碧图整图（自动缓存加载） */
Engine.prototype.atlas = function (name) {
  var a = S.atlases[name];
  return a ? this.img(a.path) : null;
};

/** 取某一帧在雪碧图中的像素矩形 */
Engine.prototype.spriteRect = function (name, index) {
  return S.rect(name, index);
};

/**
 * 绘制雪碧图帧到目标矩形（等比缩放并居中，不会拉伸变形）
 * 返回 true 表示真的画出来了，false 表示图还没加载好（调用方走兜底绘制）
 */
Engine.prototype.drawSprite = function (ctx, name, index, dx, dy, dw, dh) {
  var im = this.atlas(name);
  if (!im) return false;
  var rc = S.rect(name, index);
  if (!rc) return false;
  var k = Math.min(dw / rc.sw, dh / rc.sh);
  var w = rc.sw * k, h = rc.sh * k;
  try {
    ctx.drawImage(im, rc.sx, rc.sy, rc.sw, rc.sh,
      dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
  } catch (e) { return false; }
  return true;
};

/** 猫咪立绘：品种 typeId（雪碧图未就绪时自动降级为简笔猫脸） */
Engine.prototype.drawCat = function (ctx, typeId, dx, dy, dw, dh) {
  var idx = S.catFrames[typeId];
  if (idx === undefined) idx = 0;
  if (this.drawSprite(ctx, 'cat', idx, dx, dy, dw, dh)) return true;
  D.catFace(ctx, dx + dw / 2, dy + dh / 2, Math.min(dw, dh) * 0.40, (idx * 53) % 360);
  return false;
};

/** 图标：shop.js / catTypes.js 里的 icon 字段（food_can / prop_hint / sick_cold ...） */
Engine.prototype.drawIcon = function (ctx, key, dx, dy, dw, dh) {
  var idx = S.iconFrames[key];
  if (idx === undefined) return false;
  if (this.drawSprite(ctx, 'icon', idx, dx, dy, dw, dh)) return true;
  // 兜底：浅色圆角块，避免出现空白
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  D.roundRect(ctx, dx, dy, dw, dh, Math.min(dw, dh) * 0.25);
  ctx.fill();
  return false;
};

/** 雪碧图是否已就绪（供场景做可见的自检提示） */
Engine.prototype.atlasReady = function () {
  return { cat: !!this.atlas('cat'), icon: !!this.atlas('icon') };
};

/** 棋盘图块：id 1..S.tileCount（1..24 猫脸 cats 图集，25..48 道具 icons 图集） */
Engine.prototype.drawTile = function (ctx, id, dx, dy, dw, dh) {
  return this.drawSprite(ctx, S.tileAtlas(id), S.tileIndexOf(id), dx, dy, dw, dh);
};

/**
 * 整图绘制：cover 模式（等比缩放铺满目标矩形并居中裁切，不拉伸）
 * focusY: 0~1 纵向关注点（0 顶 1 底，默认 0.5），用于插画重点区域不裁掉
 * 返回 false 表示图片未就绪
 */
Engine.prototype.drawImgCover = function (ctx, path, dx, dy, dw, dh, focusY) {
  var im = this.img(path);
  if (!im || !im.width) return false;
  var k = Math.max(dw / im.width, dh / im.height);
  var w = im.width * k, h = im.height * k;
  var fy = focusY === undefined ? 0.5 : focusY;
  try {
    ctx.drawImage(im, dx + (dw - w) / 2, dy + (dh - h) * fy, w, h);
  } catch (e) { return false; }
  return true;
};

/** UI 图标（nav_* / btn_*），未就绪返回 false 供调用方兜底 */
Engine.prototype.drawUiIcon = function (ctx, name, dx, dy, dw, dh) {
  var im = this.img('assets/textures/ui/' + name + '.png');
  if (!im) return false;
  try {
    ctx.drawImage(im, dx, dy, dw, dh);
  } catch (e) { return false; }
  return true;
};

/** 启动预加载（雪碧图 + 场景插画 + 图标），避免游戏中才加载出现空白闪烁 */
Engine.prototype.preload = function (done) {
  var paths = [];
  // 两张雪碧图
  paths.push(S.atlases.cat.path);
  paths.push(S.atlases.icon.path);
  // 场景插画（表盘）
  paths.push('assets/textures/scenes/dial.png');
  // 主页分层素材（设计稿切片；切片里的文字已全部抹除，运行期按 i18n 重绘）
  var HOME = ['bg', 'title', 'coin_pill', 'btn_stamina', 'btn_mail', 'btn_event',
    'hero', 'taskbar', 'card_game', 'card_room', 'card_shop', 'card_hosp'];
  for (var i = 0; i < HOME.length; i++)
    paths.push('assets/textures/home/' + HOME[i] + '.png');
  // 今日任务页
  var TASK = ['bg', 'cat1', 'cat2', 'cat3', 'cat4', 'fish_blue', 'fish_orange',
    'box', 'bell', 'gcat', 'bcat', 'hammer', 'candy', 'limit_card', 'gift'];
  for (var t = 0; t < TASK.length; t++)
    paths.push('assets/textures/task/' + TASK[t] + '.png');
  // 连连看关卡界面：分层美术素材（背景/棋盘框/HUD/道具按钮/装饰）；棋子仍走 cats / icons 雪碧图
  try {
    var COZY = require('./ui/cozyArt.js').ALL;
    for (var ci = 0; ci < COZY.length; ci++) paths.push(COZY[ci]);
  } catch (e) { }
  // 注：温馨小屋(home2)、咪窝(nest)、领养品种(breeds)的资源在分包内，
  // 不在这里启动预加载；由对应场景 onShow 调 engine.ensureSubs 加载分包后按需预热。
  // 结算弹窗
  var POP = ['panel_win', 'panel_lose', 'reward_strip', 'coin', 'star',
    'cat_orange', 'cat_white', 'cat_gray', 'cat_black',
    'yarn', 'bells', 'cloud', 'fish_gray', 'bell_small', 'prop_yarn', 'prop_bomb'];
  for (var q = 0; q < POP.length; q++)
    paths.push('assets/textures/pop/' + POP[q] + '.png');
  // UI 图标（全站统一底部导航）
  var UI = ['nav_home', 'nav_game', 'nav_room', 'nav_shop', 'nav_hospital', 'nav_bag'];
  for (var u = 0; u < UI.length; u++)
    paths.push('assets/textures/ui/' + UI[u] + '.png');
  var left = paths.length;
  var self = this;
  var keys = [];
  for (var p = 0; p < paths.length; p++) {
    keys.push(this._key(paths[p]));
    this.img(paths[p]);
  }
  // 轮询直至全部加载完毕（或超时 8 秒放行）
  var waited = 0;
  var timer = setInterval(function () {
    waited += 100;
    var ready = 0;
    for (var k = 0; k < keys.length; k++) if (self._imgs[keys[k]]) ready++;
    if (ready >= keys.length || waited > 8000) {
      clearInterval(timer);
      self._reportAssets(keys);
      if (done) done();
    }
  }, 100);
};

/** 资源加载自检：控制台输出缺失清单，便于排查（尤其真机图片加载失败） */
Engine.prototype._reportAssets = function (paths) {
  var miss = [];
  for (var i = 0; i < paths.length; i++)
    if (!this._imgs[paths[i]]) miss.push(paths[i]);
  this.missingAssets = miss;
  if (typeof console !== 'undefined' && console.info) {
    console.info('[assets] ' + (paths.length - miss.length) + '/' + paths.length + ' loaded');
    if (miss.length && console.warn) console.warn('[assets] missing: ' + miss.join(' , '));
  }
};

Engine.prototype.shake = function () { this.shakeT = 0.25; };

/** 已加载的分包集合（避免重复下载） */
Engine.prototype._subs = null;

/**
 * 确保一组分包已加载；全部就绪后回调 cb(ok)。
 * 浏览器预览 / 无 wx.loadSubpackage 时立即就绪，不影响逻辑。
 */
Engine.prototype.ensureSubs = function (names, cb) {
  var self = this;
  if (!self._subs) self._subs = {};
  names = names || [];
  var pending = names.filter(function (n) { return !self._subs[n]; });
  if (!pending.length) { if (cb) cb(true); return; }
  var left = pending.length, ok = true;
  pending.forEach(function (n) {
    A.loadSubpackage(n, function (s) {
      if (s) self._subs[n] = true; else ok = false;
      left--;
      if (left === 0 && cb) cb(ok);
    });
  });
};

/**
 * 等一组图片加载完成再回调（用于分包下载完成后的解码空档）。
 * 50ms 轮询；超过 timeoutMs 直接回调，保证任何情况下都不会卡在加载态。
 */
Engine.prototype.waitImages = function (paths, cb, timeoutMs) {
  var self = this;
  var list = paths || [], total = list.length, fired = false;
  var now = function () { return Date.now ? Date.now() : new Date().getTime(); };
  var deadline = now() + (timeoutMs || 1500);
  function fin() { if (!fired) { fired = true; if (cb) cb(); } }
  if (!total) { fin(); return; }
  function ok(i) {
    var im = self.img(list[i]);
    return !!(im && (im.width > 0 || im.naturalWidth > 0));
  }
  function all() {
    for (var i = 0; i < total; i++) if (!ok(i)) return false;
    return true;
  }
  if (all()) { fin(); return; }
  var iv = setInterval(function () {
    if (all() || now() > deadline) { clearInterval(iv); fin(); }
  }, 50);
};

/** 分包就绪后预热其资源（仅触发加载、不阻塞渲染） */
Engine.prototype.warmSubs = function () {
  try {
    var N = require('./ui/nestArt.js').ALL;
    for (var i = 0; i < N.length; i++) this.img(N[i]);
  } catch (e) { }
  try {
    var B = require('./core/breeds.js').ALL;
    for (var j = 0; j < B.length; j++) this.img(B[j]);
  } catch (e) { }
  try {
    var R = require('./core/breedRig.js').cleanAll;
    for (var k = 0; k < R.length; k++) this.img(R[k]);
  } catch (e) { }
};

Engine.prototype.update = function (dt) {
  var i;
  for (i = this.particles.length - 1; i >= 0; i--) {
    var p = this.particles[i];
    p.t += dt;
    if (p.t >= p.life) { this.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += p.g * dt;
  }
  for (i = this.floaters.length - 1; i >= 0; i--) {
    var f = this.floaters[i];
    f.t += dt;
    f.y -= 55 * dt;
    if (f.t >= f.life) this.floaters.splice(i, 1);
  }
  if (this.toastT > 0) this.toastT -= dt;
  if (this.shakeT > 0) this.shakeT -= dt;
  try {
    // 弹窗期间只暂停场景逻辑（含关卡计时），特效与 toast 仍正常推进
    if (!this.modal && this.current && this.current.update) this.current.update(dt);
  } catch (err) {
    this._lastError = (err && err.message) || String(err);
    console.error('[update]', err);
  }
};

Engine.prototype.render = function () {
  var ctx = this.ctx;
  ctx.save();
  if (this.shakeT > 0) {
    var s = this.shakeT / 0.25 * 5;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  // 全局背景：主题渐变（所有场景共享，与主页背景同一份实现）
  Theme.paintBg(ctx, this.W, this.H, 10);
  try {
    if (this.current && this.current.render) this.current.render(ctx);
  } catch (err) {
    this._lastError = (err && err.message) || String(err);
    console.error('[render]', err);
  }
  // 触控诊断角标（默认关闭，engine.debugTouch = true 开启，用于真机排查触点）
  if (this.debugTouch && this.lastTap) {
    this.lastTap.t += 0.016;
    if (this.lastTap.t < 0.6) {
      ctx.strokeStyle = 'rgba(240,120,60,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.lastTap.x, this.lastTap.y, 10 + this.lastTap.t * 40, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // 触点调试条（默认关闭）
  if (this.debugTouch) {
    ctx.fillStyle = 'rgba(160,140,120,0.9)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var taps = this._tapLog = this._tapLog || [];
    var dbg = 'v2.5 触点:' + (this.tapCount || 0) +
      ' 画布:' + Math.round(this.W) + 'x' + Math.round(this.H) +
      ' 最近点击:' + (taps.length ? taps.map(function (t) { return Math.round(t.x) + ',' + Math.round(t.y); }).join(' ') : '-') +
      ' 场景:' + (this.stack && this.stack.length ? this.stack[this.stack.length - 1] : '-');
    ctx.fillText(dbg, 8, this.H - 16);
  }

  // 错误浮层（便于真机排查）
  if (this._lastError) {
    ctx.fillStyle = 'rgba(200,40,40,0.92)';
    var ew = this.W - 40;
    var lines = [];
    var msg = String(this._lastError).split('\n').slice(0, 6).join('\n');
    for (var li = 0; li < msg.length; li += 28) lines.push(msg.slice(li, li + 28));
    var eh = 34 + lines.length * 18;
    roundRectPath(ctx, 20, 90, ew, eh, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('脚本错误：', 34, 100);
    for (var ln = 0; ln < lines.length; ln++) ctx.fillText(lines[ln], 34, 120 + ln * 18);
  }
  // 粒子
  for (var i = 0; i < this.particles.length; i++) {
    var p = this.particles[i];
    var a = 1 - p.t / p.life;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.star) {
      drawStar(ctx, p.x, p.y, p.size, p.color);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // 飘字
  for (var j = 0; j < this.floaters.length; j++) {
    var f = this.floaters[j];
    var fa = 1 - f.t / f.life;
    ctx.globalAlpha = fa;
    ctx.font = 'bold ' + f.size + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  // Toast
  if (this.toastT > 0 && this.toastMsg) {
    var ta = Math.min(1, this.toastT * 2);
    ctx.globalAlpha = ta;
    ctx.font = 'bold 16px sans-serif';
    var w = ctx.measureText(this.toastMsg).width + 40;
    ctx.fillStyle = 'rgba(60,50,50,0.85)';
    roundRectPath(ctx, (this.W - w) / 2, this.H * 0.42, w, 40, 20);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.toastMsg, this.W / 2, this.H * 0.42 + 21);
    ctx.globalAlpha = 1;
  }
  if (this.modal) this._renderModal(ctx);
  ctx.restore();
};

// ---------------- 输入 ----------------
Engine.prototype._bindInput = function () {
  var self = this;
  function handler(x, y, type) {
    try {
      if (self.modal) {
        if (type === 'down') {
          self._modalPress = !!(self._modalBtn && D.hit(self._modalBtn, x, y));
        } else {
          var onBtn = self._modalBtn && D.hit(self._modalBtn, x, y);
          var r = self._modalRect;
          var outside = !r || !D.hit(r, x, y);
          self._modalPress = false;
          if (onBtn || outside) self.closeModal();
        }
        return;
      }
      if (type === 'down') {
        self.tapCount = (self.tapCount || 0) + 1;
        self.lastTap = { x: x, y: y, t: 0 };
        (self._tapLog = self._tapLog || []).push({ x: x, y: y });
        if (self._tapLog.length > 4) self._tapLog.shift();
        // 点击反馈：小爪印，确认触控生效
        self.burst(x, y, 'rgba(240,160,90,0.6)', 4, { speed: 50, size: 3, life: 0.35, g: 0 });
        if (self.current && self.current.onTouchDown) self.current.onTouchDown(x, y);
      } else {
        if (self.current && self.current.onTouchUp) self.current.onTouchUp(x, y);
      }
    } catch (err) {
      self._lastError = (err && err.message) || String(err);
      console.error('[touch]', err);
    }
  }
  function fromEvent(e, type) {
    var t = (type === 'down' ? e.touches : e.changedTouches) || e.touches;
    if (t && t.length) {
      var x = t[0].clientX, y = t[0].clientY;
      self._rawTap = { x: x, y: y };
      // 坐标自适应：若超出画布逻辑尺寸，尝试按物理像素换算
      if (x > self.W || y > self.H) {
        var d = A.dpr || 2;
        if (x / d <= self.W && y / d <= self.H) { x = x / d; y = y / d; }
      }
      handler(x, y, type);
    }
  }
  if (A.isWx) {
    if (wx.onTouchStart) wx.onTouchStart(function (e) { fromEvent(e, 'down'); });
    if (wx.onTouchMove) wx.onTouchMove(function (e) { });
    if (wx.onTouchEnd) wx.onTouchEnd(function (e) { fromEvent(e, 'up'); });
    if (wx.onTouchCancel) wx.onTouchCancel(function (e) { fromEvent(e, 'up'); });
  } else {
    var cv = null;
    setTimeout(function () {
      cv = A.canvas;
      function pos(e) {
        var r = cv.getBoundingClientRect();
        return [(e.clientX - r.left) * (self.W / r.width), (e.clientY - r.top) * (self.H / r.height)];
      }
      cv.addEventListener('mousedown', function (e) { var p = pos(e); handler(p[0], p[1], 'down'); });
      cv.addEventListener('mouseup', function (e) { var p = pos(e); handler(p[0], p[1], 'up'); });
      cv.addEventListener('touchstart', function (e) { e.preventDefault(); var t = e.touches[0]; var p = pos(t); handler(p[0], p[1], 'down'); }, { passive: false });
      cv.addEventListener('touchend', function (e) { e.preventDefault(); var t = e.changedTouches[0]; var p = pos(t); handler(p[0], p[1], 'up'); }, { passive: false });
    }, 0);
  }
};

// ---------------- 小工具 ----------------
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var ang = -Math.PI / 2 + i * Math.PI / 5;
    var rr = i % 2 === 0 ? r : r * 0.45;
    var px = x + Math.cos(ang) * rr;
    var py = y + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

module.exports = Engine;
