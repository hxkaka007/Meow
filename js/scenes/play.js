/**
 * 游戏主场景：棋盘渲染 + HUD + 道具栏 + 结算弹窗
 */
var D = require('../ui/draw.js');
var Cozy = require('../ui/cozy.js');
var Art = require('../ui/cozyArt.js');
var Game = require('../core/game.js');
var Save = require('../core/save.js');
var Level = require('../core/level.js');
var Tasks = require('../core/tasks.js');
var I = require('../core/i18n.js');
var A = require('../adapter.js');

function Play() {
  this.game = new Game();
  this._bindEvents();
  this.anim = { cells: {}, removes: [], line: null, shakes: {}, pops: {} };
}

Play.prototype.onShow = function (params) {
  this.level = (params && params.level) || Save.get('maxLevel');
  this.bombMode = false;
  this.popup = null;   // 'pause' | 'win' | 'lose' | 'shop'
  this.countdown = 0;
  this.game.start(this.level);
  // 道具直接使用背包存档（商城购买持久化）
  this.game.items = Save.load().props;
  // 猫咪加成：孟加拉豹猫 连击分数+20%（取最高）
  this.comboBonus = 0;
  var cats = Save.get('cats');
  for (var i = 0; i < cats.length; i++) {
    if (cats[i].typeId === 'bao') this.comboBonus = 0.2;
  }
  this.game.comboBonus = this.comboBonus;
  A.setKeepScreenOn();
};

// ---------------- 事件绑定（逻辑 -> 表现） ----------------
Play.prototype._bindEvents = function () {
  var self = this;
  var g = this.game;

  g.on('select', function (d) { self._pop(d.r, d.c); });
  g.on('deselect', function () { });
  g.on('mismatch', function (pair) {
    for (var i = 0; i < 2; i++) {
      var key = pair[i].r + '_' + pair[i].c;
      self.anim.shakes[key] = 0.4;
    }
    self.engine.shake();
  });
  g.on('match', function (d) {
    self._showLine(d.path);
    var idx = 0;
    var cells = [[d.r1, d.c1], [d.r2, d.c2]];
    cells.forEach(function (rc) {
      self.anim.removes.push({ r: rc[0], c: rc[1], t: 0, delay: 0.08 * idx++, img: self.game.grid._lastImgs ? 0 : 0 });
    });
    // 消除处粒子
    setTimeout(function () { }, 0);
    d.unlocked.forEach(function (rc) {
      self._pop(rc[0], rc[1]);
      self.engine.float(self._cx(rc[1]), self._cy(rc[0]), I.t('unlockFloat'), '#7ec8c0', 16);
    });
    if (d.combo > 1) {
      self.engine.float(self._cx((d.c1 + d.c2) / 2), self._cy((d.r1 + d.r2) / 2) - 40,
        I.t('comboFloat', { n: d.combo }), '#ff8899', 20 + Math.min(d.combo * 2, 14));
      if (d.combo >= 3) Tasks.add('combo', 1);
    }
    self.engine.float(self._cx((d.c1 + d.c2) / 2), self._cy((d.r1 + d.r2) / 2), '+' + d.gain, '#f0a030', 18);
    // 每日任务：消除猫头
    Tasks.add('clear', 2);
  });
  g.on('bomb', function (d) {
    Tasks.add('bomb', 1);
    (d.cells || []).forEach(function (rc) {
      self.anim.removes.push({ r: rc[0], c: rc[1], t: 0, delay: Math.random() * 0.15 });
      self.engine.burst(self._cx(rc[1]), self._cy(rc[0]), '#ff9a62', 10, { star: true });
    });
    self.engine.burst(self._cx(d.c), self._cy(d.r), '#ff6a3a', 26, { speed: 260, size: 7 });
    self.engine.shake();
  });
  g.on('icebreak', function (d) {
    self.engine.burst(self._cx(d.c), self._cy(d.r), '#9adcf0', 14, { star: true, speed: 120 });
  });
  g.on('autoshuffle', function () { self.engine.toast(I.t('autoShuffle')); self._flashBoard = 0.5; });
  g.on('chainloose', function (cells) {
    (cells || []).forEach(function (rc) {
      self.engine.float(self._cx(rc[1]), self._cy(rc[0]), I.t('chainBreak'), '#a0a8b8', 14);
    });
    if (cells && cells.length) self.engine.toast(I.t('chainAuto'));
  });
  g.on('shuffle', function () { self._flashBoard = 0.5; });
  g.on('moveswap', function () { self._flashBoard = 0.3; });
  g.on('win', function (d) {
    var reward = Save.onWin(self.level, d.score, d.timeLeft, self.game.cfg.stepLimit > 0 ? self.game.stepsLeft : 0, self.game.maxCombo);
    self._reward = reward;
    self.popup = 'win';
    self._stars = self._calcStars(d);
    self._loseStreak = 0;
    Save.set('loseStreak', 0);
    if (Tasks.add('level', 1)) self.engine.toast(I.t('taskAllDone'));
  });
  g.on('lose', function (d) {
    self.popup = 'lose';
    self._loseReason = d.reason;
    // "还差 N 分"：按场上剩余方块估算缺口
    var remain = 0;
    try { remain = self.game.grid.remainCount(); } catch (e) { }
    self._scoreGap = Math.max(10, remain * 10);
    // 连续3关失败 → 猫咪骨折（GDD 9.1）
    var streak = (Save.get('loseStreak') || 0) + 1;
    Save.set('loseStreak', streak);
    self._fractured = false;
    if (streak >= 3) {
      var cats = Save.get('cats');
      var healthy = [];
      for (var i = 0; i < cats.length; i++) if (!cats[i].sickness) healthy.push(cats[i]);
      if (healthy.length) {
        var victim = healthy[Math.floor(Math.random() * healthy.length)];
        victim.sickness = 'bone';
        victim.sickSince = Date.now();
        Save.save();
        self._fractured = victim.name;
        Save.set('loseStreak', 0);
      }
    }
  });
  g.on('bombmode', function () {
    self.bombMode = true;
    self.engine.toast(I.t('bombTip'));
  });
  g.on('addtime', function (n) { self.engine.float(self.engine.W / 2, self.engine.H * 0.2, I.t('addTimeFloat', { n: n }), '#7ec8c0', 22); });
  g.on('itemfail', function (d) {
    if (d.reason === 'none') self.engine.toast(I.t('propUsedUp'));
    else if (d.reason === 'noTimeMode') self.engine.toast(I.t('noTimeMode'));
  });
};

Play.prototype._calcStars = function (d) {
  var s = 1;
  if (this.cfgTimeLeftHint) { }
  var total = this.game.cfg.timeLimit > 0 ? this.game.cfg.timeLimit : 1;
  if (this.game.cfg.timeLimit > 0) {
    var ratio = d.timeLeft / total;
    s = ratio > 0.5 ? 3 : (ratio > 0.2 ? 2 : 1);
  } else {
    s = this.game.cfg.stepLimit > 0 && this.game.stepsLeft > this.game.cfg.stepLimit * 0.3 ? 3 : 2;
  }
  return s;
};

// ---------------- 坐标 ----------------
/**
 * 参考图构图：顶部「返回 / 第N关 / 剩余时间」，中部大奶油棋盘框，
 * 棋子网格占框上部、猫窝与躺猫占框下部，底部四枚软糖道具按钮。
 * 所有尺寸按屏宽/屏高比例推导，适配固定 6x6 棋盘（也兼容其它网格尺寸）。
 */
Play.prototype._layout = function () {
  var W = this.engine.W, H = this.engine.H;
  var g = this.game.grid;
  this.en = I.lang() === 'en';

  // ---------- 顶部 HUD ----------
  var pad = W * 0.030;
  var hudY = Math.max(9, H * 0.017);
  var backS = Math.min(W * 0.118, H * 0.062);
  this.backRect = { x: pad, y: hudY, w: backS, h: backS };

  // 灵动岛 / 刘海在屏幕正中顶部：只把居中的关卡标题下移，左右控件保持贴顶对齐
  var islandTop = Math.min(Math.max(A.safeTop || 0, W * 0.032), H * 0.055);
  var titleW = W * 0.345, titleH = titleW * (140 / 450);
  this.titleRect = {
    x: W / 2 - titleW / 2,
    y: hudY + (backS - titleH) / 2 + islandTop,
    w: titleW, h: titleH
  };

  var labelW = W * 0.258, labelH = labelW * (166 / 360);
  this.labelRect = { x: W - pad - labelW, y: hudY - 1, w: labelW, h: labelH };

  // 参考图没有暂停控件，游戏需要，做成返回与标题之间的小圆钮
  var ps = Math.min(26, backS * 0.62);
  this.pauseRect = { x: pad + backS + W * 0.020, y: hudY + (backS - ps) / 2, w: ps, h: ps };

  // ---------- 底部道具按钮（素材原生比例 836:649） ----------
  var gap = W * 0.026, margin = W * 0.036;
  var bw = (W - margin * 2 - gap * 3) / 4, bh = bw / 1.29;
  this.itemsBar = { x: margin, y: H - bh - Math.max(9, H * 0.017), w: bw, h: bh, gap: gap };

  // ---------- 棋盘外框 ----------
  var fx = W * 0.022, fy = H * 0.155;
  var fw = W - fx * 2, fh = H * 0.872 - fy;
  this.frameRect = { x: fx, y: fy, w: fw, h: fh };

  // ---------- 棋子网格（框内上部居中） ----------
  var innerW = fw - W * 0.052;
  var decorH = fh * 0.235;
  var gridAreaH = fh - decorH - fh * 0.048;
  var cw = Math.min(innerW / g.cols, Math.max(18, gridAreaH / g.rows));
  this.cell = cw;
  this.bw = cw * g.cols;
  this.bh = cw * g.rows;
  this.bx = fx + (fw - this.bw) / 2;
  this.by = fy + fh * 0.048 + (gridAreaH - this.bh) / 2;

  // ---------- 框内下方装饰 ----------
  var dTop = this.by + this.bh + fh * 0.015;
  var dBottom = fy + fh - fh * 0.022;
  var dH = Math.max(24, dBottom - dTop);
  var houseH = Math.min(dH, W * 0.25), houseW = houseH * (330 / 294);
  this.houseRect = { x: fx + W * 0.022, y: dBottom - houseH, w: houseW, h: houseH };
  var catH = Math.min(dH * 0.90, W * 0.235), catW = catH * (360 / 266);
  this.catRect = { x: fx + fw - catW - W * 0.012, y: dBottom - catH * 0.96, w: catW, h: catH };

  // 右上抱枕：完整落在「信息标签下沿 → 棋盘框顶边」之间，
  // 右侧留足边距，避免右角被屏幕边缘或棋盘框圆角挡住
  var pw = W * 0.225, ph = pw * (199 / 360);
  var band = fy - (this.labelRect.y + this.labelRect.h) - H * 0.008;
  if (ph > band) { ph = Math.max(20, band); pw = ph * (360 / 199); }
  this.pillowRect = {
    x: W - pw - W * 0.028,
    y: fy - ph - H * 0.004,
    w: pw, h: ph
  };
};
Play.prototype._cx = function (c) { return this.bx + (c + 0.5) * this.cell; };
Play.prototype._cy = function (r) { return this.by + (r + 0.5) * this.cell; };

// ---------------- 更新 ----------------
Play.prototype.update = function (dt) {
  if (!this.popup) this.game.update(dt);
  // 移除动画推进
  for (var i = this.anim.removes.length - 1; i >= 0; i--) {
    var rm = this.anim.removes[i];
    rm.t += dt;
    if (rm.t > 0.08) {
      var p = 1 - Math.max(0, (rm.t - 0.08) / 0.25);
      if (p <= 0) {
        this.engine.burst(this._cx(rm.c), this._cy(rm.r), '#ffd280', 12, { star: true });
        this.anim.removes.splice(i, 1);
      }
    }
  }
  // 连线动画
  if (this.anim.line) {
    this.anim.line.t += dt;
    if (this.anim.line.t > 0.5) this.anim.line = null;
  }
  for (var k in this.anim.shakes) {
    this.anim.shakes[k] -= dt;
    if (this.anim.shakes[k] <= 0) delete this.anim.shakes[k];
  }
  if (this._flashBoard > 0) this._flashBoard -= dt;
  for (var pk in this.anim.pops) {
    this.anim.pops[pk].t += dt;
    if (this.anim.pops[pk].t > 0.25) delete this.anim.pops[pk];
  }
};

Play.prototype._pop = function (r, c) { this.anim.pops[r + '_' + c] = { t: 0 }; };
Play.prototype._showLine = function (path) {
  this.anim.line = { path: path, t: 0 };
};

// ---------------- 渲染 ----------------
Play.prototype.render = function (ctx) {
  this._layout();
  var W = this.engine.W, H = this.engine.H;
  // 覆盖引擎全局主题底色：本场景固定使用分层素材的奶油毛绒背景
  if (!Art.paintBg(ctx, this.engine, W, H)) Cozy.paintBg(ctx, W, H);
  this._renderDecor(ctx, W, H);   // 抱枕 / 棋盘框 / 猫窝 / 躺猫
  this._renderHud(ctx, W);
  this._renderBoard(ctx);        // 棋子卡 / 连线 / 特殊元素
  this._renderItems(ctx, W, H);
  if (this._flashBoard > 0) {
    ctx.globalAlpha = this._flashBoard * 0.4;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, this.by - 8, W, this.bh + 16);
    ctx.globalAlpha = 1;
  }
  if (this.popup) this._renderPopup(ctx, W, H);
  if (this.countdown > 0) {
    ctx.fillStyle = 'rgba(90,54,32,0.22)';
    ctx.fillRect(0, 0, W, H);
    D.text(ctx, Math.ceil(this.countdown), W / 2, H / 2, 80, '#fff');
  }
};

/** 背景之上的分层美术：抱枕 → 棋盘框 → 框内猫窝与躺猫 */
Play.prototype._renderDecor = function (ctx, W, H) {
  var e = this.engine;
  var f = this.frameRect, p = this.pillowRect;

  // 右上抱枕（画在框之前，完整露在框顶边之上）
  if (!Art.decor(ctx, e, 'pillow', p.x, p.y, p.w, p.h))
    Cozy.plate(ctx, p.x, p.y, p.w, p.h, Math.min(18, p.h * 0.42));

  // 奶油圆角棋盘外框
  if (!Art.frame(ctx, e, f.x, f.y, f.w, f.h))
    Cozy.plate(ctx, f.x, f.y, f.w, f.h, Math.min(24, f.w * 0.05),
      { fillTop: '#FDEDD9', fillBottom: '#F7D7B2' });

  // 框内下方：左猫窝 / 右躺猫
  var hr = this.houseRect, cr = this.catRect;
  if (!Art.decor(ctx, e, 'house', hr.x, hr.y, hr.w, hr.h))
    Cozy.catHouse(ctx, hr.x, hr.y, hr.w, hr.h, {});
  if (!Art.decor(ctx, e, 'cat', cr.x, cr.y, cr.w, cr.h)) {
    // 图片未就绪的兜底：一团橘色猫脸，避免出现空白
    ctx.save();
    ctx.globalAlpha = 0.9;
    D.catFace(ctx, cr.x + cr.w / 2, cr.y + cr.h / 2, Math.min(cr.w, cr.h) * 0.38, 28);
    ctx.restore();
  }
};

Play.prototype._renderHud = function (ctx, W) {
  var g = this.game, e = this.engine;
  var b = this.backRect, t = this.titleRect, l = this.labelRect;

  // 左上：橙色圆角返回按钮
  if (!Art.back(ctx, e, b.x, b.y, b.w, b.h))
    Cozy.backCircle(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w / 2);
  this.backBtn = { key: 'back', x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 };

  // 居中：立体关卡标题（底板来自素材，文字按关卡号动态绘制）
  if (!Art.titlePlate(ctx, e, t.x, t.y, t.w, t.h))
    Cozy.plate(ctx, t.x, t.y, t.w, t.h, t.h / 2);
  Art.embossText(ctx, I.t('levelShort', { n: this.level }),
    t.x + t.w / 2, t.y + t.h * 0.50, t.h * 0.52);

  // 右上：只显示剩余时间（限步关才回退显示剩余步数），两行排版：小标签 + 大数字
  if (!Art.labelPlate(ctx, e, l.x, l.y, l.w, l.h))
    Cozy.plate(ctx, l.x, l.y, l.w, l.h, l.h * 0.30);
  var timeMode = g.cfg.timeLimit > 0;
  var line1 = I.t(timeMode ? 'cozyTimeLabel' : 'cozyStepLabel');
  var line2 = timeMode ? Art.mmss(g.timeLeft) : String(g.stepsLeft);
  Art.plateText(ctx, line1, l.x + l.w / 2, l.y + l.h * 0.30,
    Math.max(8, l.h * 0.26));
  Art.plateText(ctx, line2, l.x + l.w / 2, l.y + l.h * 0.70,
    Math.max(12, l.h * 0.42));

  // 小暂停钮（参考图无此控件，游戏需要，做得尽量克制）
  var p = this.pauseRect;
  ctx.save();
  ctx.fillStyle = 'rgba(255,248,234,0.90)';
  D.roundRect(ctx, p.x, p.y, p.w, p.h, p.w * 0.34); ctx.fill();
  ctx.strokeStyle = 'rgba(214,158,102,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#9A5A2C';
  ctx.font = 'bold ' + Math.round(p.h * 0.52) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('II', p.x + p.w / 2, p.y + p.h / 2);
  ctx.restore();
  this.pauseBtn = { key: 'pause', x: p.x - 3, y: p.y - 3, w: p.w + 6, h: p.h + 6 };

  // 分数小字（HUD 与棋盘框之间）
  Art.smallText(ctx, I.t('scoreN', { n: g.score }), W / 2,
    this.frameRect.y - Math.max(9, W * 0.025), Math.max(9, W * 0.030), 'rgba(166,108,68,0.92)');
};

Play.prototype._renderBoard = function (ctx) {
  var g = this.game.grid;
  var cw = this.cell;
  var t = this.engine.t || 0;

  // 棋盘外框已由 _renderDecor 用素材绘制，这里只画棋子卡
  var pad = cw * 0.035;
  for (var r = 0; r < g.rows; r++) {
    for (var c = 0; c < g.cols; c++) {
      var cell = g.at(r, c);
      var key = r + '_' + c;
      if (!cell) {
        // 空格：浅奶油凹陷
        Cozy.tileEmpty(ctx, this.bx + c * cw + pad, this.by + r * cw + pad,
          cw - pad * 2, cw - pad * 2, cw * 0.20);
        continue;
      }
      // 位移（消除动画缩放 / 抖动）
      var ox = 0, oy = 0, scale = 1, alpha = 1;
      for (var i = 0; i < this.anim.removes.length; i++) {
        var rm = this.anim.removes[i];
        if (rm.r === r && rm.c === c && rm.t > 0.08) {
          var p = 1 - (rm.t - 0.08) / 0.25;
          scale = Math.max(0.05, p);
          alpha = p;
        } else if (rm.r === r && rm.c === c) {
          scale = 1.15; // 先放大
        }
      }
      if (this.anim.shakes[key]) {
        ox = Math.sin(this.anim.shakes[key] * 40) * 5 * this.anim.shakes[key] / 0.4;
      }
      var popS = 1;
      if (this.anim.pops[key]) {
        var pp = this.anim.pops[key].t / 0.25;
        popS = 1 + 0.12 * Math.sin(pp * Math.PI);
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this._cx(c) + ox, this._cy(r) + oy);
      ctx.scale(scale * popS, scale * popS);
      // 卡片之间留一道奶油缝（后续所有以 cw 为单位的绘制同步收缩）
      ctx.scale((cw - pad * 2) / cw, (cw - pad * 2) / cw);

      // 提示高亮
      var isHint = false, isSel = false;
      if (this.game.hintPair) {
        for (var h = 0; h < 2; h++)
          if (this.game.hintPair[h].r === r && this.game.hintPair[h].c === c) isHint = true;
      }
      if (this.game.sel && this.game.sel.r === r && this.game.sel.c === c) isSel = true;

      if (isHint || isSel) {
        ctx.save();
        var pulse = 1 + Math.sin(t * 6) * 0.08;
        ctx.shadowColor = isSel ? '#FFAE55' : '#7FD9B2';
        ctx.shadowBlur = 14;
        ctx.fillStyle = isSel ? 'rgba(255,196,112,0.55)' : 'rgba(150,228,192,0.50)';
        D.roundRect(ctx, -cw / 2 - 4 * pulse, -cw / 2 - 4 * pulse, cw + 8 * pulse, cw + 8 * pulse, cw * 0.22);
        ctx.fill();
        ctx.restore();
      }

      // 奶油白卡由 cozy.js 绘制，卡面图案用项目原有的 cats / icons 雪碧图
      Cozy.tileCard(ctx, -cw / 2, -cw / 2, cw, cw, cw * 0.20);
      if (cell.flip && !cell.revealed) {
        // 背面：奶油猫爪印卡片
        ctx.fillStyle = '#F7E4CC';
        D.roundRect(ctx, -cw / 2 + 3, -cw / 2 + 3, cw - 6, cw - 6, cw * 0.18);
        ctx.fill();
        D.paw(ctx, 0, 0, cw * 0.17, '#DDB68F', 0.2);
      } else {
        var isz = cw * 0.82;
        var ok = this.engine.drawTile(ctx, cell.img, -isz / 2, -isz / 2, isz, isz);
        if (!ok) {
          // 雪碧图未就绪的兜底：简笔猫脸，保证仍可辨认配对
          var hue = (cell.img * 47) % 360;
          D.catFace(ctx, 0, 0, cw * 0.30, hue);
        }
      }

      // 特殊元素覆盖
      if (cell.ice) {
        ctx.globalAlpha = alpha * 0.65;
        ctx.fillStyle = '#bfe8f5';
        D.roundRect(ctx, -cw / 2 + 2, -cw / 2 + 2, cw - 4, cw - 4, cw * 0.16);
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-cw * 0.2, -cw * 0.3); ctx.lineTo(cw * 0.25, cw * 0.1);
        ctx.moveTo(cw * 0.1, -cw * 0.35); ctx.lineTo(-cw * 0.15, cw * 0.3);
        ctx.stroke();
      }
      if (cell.chain) {
        ctx.strokeStyle = 'rgba(120,120,130,0.95)';
        ctx.lineWidth = 3;
        for (var ly = -1; ly <= 1; ly++) {
          ctx.beginPath();
          ctx.moveTo(-cw / 2 + 2, ly * cw * 0.28);
          ctx.lineTo(cw / 2 - 2, ly * cw * 0.28 + 4);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(80,80,90,0.9)';
        ctx.lineWidth = 2;
        D.roundRect(ctx, -cw / 2 + 4, -cw / 2 + 4, cw - 8, cw - 8, cw * 0.14);
        ctx.stroke();
      }
      if (cell.move) {
        ctx.fillStyle = 'rgba(126,200,192,0.95)';
        ctx.font = 'bold ' + cw * 0.24 + 'px sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('⇄', -cw / 2 + 3, -cw / 2 + 2);
      }
      if (cell.bomb) {
        ctx.fillStyle = 'rgba(255,120,80,0.95)';
        ctx.font = 'bold ' + cw * 0.26 + 'px sans-serif';
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText('💣', cw / 2 - 2, cw / 2 - 2);
      }
      ctx.restore();
    }
  }

  // 连线动画（爪印轨迹）
  if (this.anim.line) {
    var ln = this.anim.line;
    var prog = Math.min(1, ln.t / 0.35);
    var pts = ln.path.map(function (p) { return [this.bx + (p[1] + 0.5) * cw, this.by + (p[0] + 0.5) * cw]; }, this);
    // 折线总长
    var total = 0;
    for (var s = 1; s < pts.length; s++)
      total += Math.abs(pts[s][0] - pts[s - 1][0]) + Math.abs(pts[s][1] - pts[s - 1][1]);
    var walked = total * prog;
    ctx.save();
    // 暖橙糖果连线
    ctx.strokeStyle = 'rgba(255,170,86,0.95)';
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var acc = 0, done = false;
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var q = 1; q < pts.length && !done; q++) {
      var seg = Math.abs(pts[q][0] - pts[q - 1][0]) + Math.abs(pts[q][1] - pts[q - 1][1]);
      if (acc + seg <= walked) { ctx.lineTo(pts[q][0], pts[q][1]); acc += seg; }
      else {
        var rem = walked - acc;
        var fx = pts[q - 1][0], fy = pts[q - 1][1];
        var dx = pts[q][0] - fx, dy = pts[q][1] - fy;
        var L = Math.abs(dx) + Math.abs(dy) || 1;
        fx += dx * rem / L; fy += dy * rem / L;
        ctx.lineTo(fx, fy);
        done = true;
      }
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // 爪印
    acc = 0; done = false;
    for (var w2 = 1; w2 < pts.length && !done; w2++) {
      var seg2 = Math.abs(pts[w2][0] - pts[w2 - 1][0]) + Math.abs(pts[w2][1] - pts[w2 - 1][1]);
      var steps = Math.max(1, Math.floor(seg2 / (cw * 0.6)));
      for (var st = 0; st < steps; st++) {
        var f = st / steps;
        var px = pts[w2 - 1][0] + (pts[w2][0] - pts[w2 - 1][0]) * f;
        var py = pts[w2 - 1][1] + (pts[w2][1] - pts[w2 - 1][1]) * f;
        if (acc + seg2 * f <= walked) D.paw(ctx, px, py, cw * 0.09, 'rgba(240,160,90,0.8)', Math.atan2(pts[w2][1] - pts[w2 - 1][1], pts[w2][0] - pts[w2 - 1][0]));
        else { done = true; break; }
      }
      acc += seg2;
    }
    ctx.restore();
  }

  // 炸弹模式提示遮罩
  if (this.bombMode) {
    ctx.fillStyle = 'rgba(255,150,80,0.10)';
    ctx.fillRect(this.bx - 8, this.by - 8, this.bw + 16, this.bh + 16);
  }
};

Play.prototype._renderItems = function (ctx, W, H) {
  var g = this.game, e = this.engine, en = this.en;
  var items = [
    { key: 'hint', label: I.t('propHint'), c1: '#FFEAB9', c2: '#FFC476', edge: 'rgba(231,163,86,0.85)' },
    { key: 'shuffle', label: I.t('propShuffle'), c1: '#FFE2EA', c2: '#FFC3D3', edge: 'rgba(228,150,168,0.80)' },
    { key: 'bomb', label: I.t('propBomb'), c1: '#F9FFEE', c2: '#E2F3CB', edge: 'rgba(166,196,132,0.85)' },
    { key: 'time', label: I.t('propTime'), c1: '#E4F8E0', c2: '#BCE8C1', edge: 'rgba(134,190,140,0.85)' }
  ];
  var B = this.itemsBar;
  this.itemBtns = [];
  for (var i = 0; i < 4; i++) {
    var x = B.x + i * (B.w + B.gap), y = B.y, w = B.w, h = B.h;
    var it = items[i], cnt = g.items[it.key] || 0;
    var btn = { key: it.key, x: x, y: y, w: w, h: h, label: it.label, cnt: cnt };
    this.itemBtns.push(btn);

    ctx.save();
    if (btn._pressed) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(0.95, 0.95);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    if (g.cfg.timeLimit <= 0 && it.key === 'time') ctx.globalAlpha = 0.62;

    // 中文用带美术字的原图；英文/图片未就绪用抹字版或纯绘制，再叠动态文字
    var ok = Art.toolBtn(ctx, e, it.key, x, y, w, h, en);
    if (!ok) Cozy.toolBtn(ctx, x, y, w, h, it.c1, it.c2, it.edge);
    if (en || !ok) {
      var fs = Math.min(h * 0.28, w * 0.80 / Math.max(2, it.label.length * 0.62));
      Art.embossText(ctx, it.label, x + w / 2, y + h * 0.70, fs, { stroke: 0.22 });
    }

    // 道具数量角标（小号，不抢画面）
    var br = Math.min(7.5, w * 0.098);
    var bcx = x + w - br - 1, bcy = y + br + 1;
    ctx.beginPath(); ctx.arc(bcx, bcy, br, 0, Math.PI * 2);
    ctx.fillStyle = cnt > 0 ? '#F39369' : '#CFC4B7'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(8, Math.round(br * 1.15)) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cnt, bcx, bcy);
    ctx.restore();
  }
};

// ---------------- 弹窗 ----------------
var POP = 'assets/textures/pop/';

/** 画弹窗里的一张切片（注意：不能叫 _pop —— 会和上面的消除动画 _pop(r,c) 撞名） */
Play.prototype._popImg = function (ctx, name, x, y, w, h) {
  D.img(ctx, this.engine, POP + name + '.png', x, y, w, h);
};

/** 胶囊按钮：style = 'cream' | 'orange'，同时登记命中区 */
Play.prototype._popBtn = function (ctx, key, text, x, y, w, h, style, k) {
  if (style === 'orange') D.pill(ctx, x, y, w, h, '#FFD98E', '#F2872F', '#FFF3DC', h * 0.5);
  else D.pill(ctx, x, y, w, h, '#FFF3DE', '#F4D3AE', '#FFF9EC', h * 0.5);
  D.label(ctx, text, x + w / 2, y + h * 0.53, h * 0.46,
    style === 'orange' ? '#6B3A1E' : '#7A4425', {
    stroke: style === 'orange' ? 'rgba(255,240,214,0.55)' : 'rgba(255,255,255,0.8)',
    strokeW: 3 * k, maxW: w * 0.80
  });
  this.popupBtns.push({ key: key, x: x, y: y, w: w, h: h });
};

Play.prototype._renderPopup = function (ctx, W, H) {
  ctx.fillStyle = 'rgba(96,58,36,0.48)';
  ctx.fillRect(0, 0, W, H);
  this.popupBtns = [];
  if (this.popup === 'win') { this._popupWin(ctx, W, H); return; }
  if (this.popup === 'lose') { this._popupLose(ctx, W, H); return; }
  this._popupMenu(ctx, W, H);
};

/** 闯关成功（success-png 设计稿） */
Play.prototype._popupWin = function (ctx, W, H) {
  var PW = 640, PH = 564;
  var s = Math.min(W * 0.80 / PW, H * 0.86 / PH);
  var px = (W - PW * s) / 2, py = (H - PH * s) / 2 + 10 * s;
  var X = function (v) { return px + v * s; };
  var Y = function (v) { return py + v * s; };

  // 周边装饰（画在面板之前，被面板压住一部分）
  this._popImg(ctx, 'cat_orange', X(266), Y(-92), 168 * s, 155 * s);
  this._popImg(ctx, 'cat_white', X(544), Y(-70), 128 * s, 124 * s);
  this._popImg(ctx, 'yarn', X(-44), Y(244), 130 * s, 152 * s);
  this._popImg(ctx, 'bells', X(566), Y(300), 132 * s, 256 * s);
  this._popImg(ctx, 'cat_gray', X(-38), Y(390), 172 * s, 163 * s);

  this._popImg(ctx, 'panel_win', px, py, PW * s, PH * s);

  D.label(ctx, I.t('winTitle'), X(320), Y(100), 62 * s, '#7A4A32', {
    stroke: 'rgba(255,250,240,0.85)', strokeW: 6 * s, maxW: 500 * s
  });
  D.label(ctx, I.t('winScore', { n: this.game.score }), X(320), Y(182), 31 * s, '#8A5B3E', {
    maxW: 420 * s
  });

  // 奖励栏
  this._popImg(ctx, 'reward_strip', X(44), Y(214), 552 * s, 184 * s);
  var r = this._reward || { total: 0 };
  var stars = this._stars || 1;
  var fish = Math.max(1, Math.round(this.game.score / 400));
  var items = [
    ['coin', I.t('rewardCoin', { n: r.total })],
    ['fish_gray', I.t('rewardFish', { n: fish })],
    ['star', I.t('rewardStar', { n: stars, m: 3 })]
  ];
  for (var i = 0; i < 3; i++) {
    var cx = X(44 + 552 * (i + 0.5) / 3);
    this._popImg(ctx, items[i][0], cx - 42 * s, Y(238), 84 * s, 82 * s);
    D.label(ctx, items[i][1], cx, Y(352), 27 * s, '#8A4A22', { maxW: 170 * s });
  }

  var by = Y(424), bh = 78;
  this._popBtn(ctx, 'next', I.t('winContinue'), X(54), by, 238 * s, bh * s, 'cream', s);
  this._popBtn(ctx, 'home', I.t('winClaim'), X(348), by, 238 * s, bh * s, 'orange', s);
};

/** 闯关失败（failed-png 设计稿） */
Play.prototype._popupLose = function (ctx, W, H) {
  // 面板素材 838x584（@2x）= 419x292，比例 1.435；这里取 640x446 保持同一比例
  var PW = 640, PH = 446;
  var s = Math.min(W * 0.80 / PW, H * 0.78 / PH);
  var px = (W - PW * s) / 2, py = (H - PH * s) / 2 - 16 * s;
  var X = function (v) { return px + v * s; };
  var Y = function (v) { return py + v * s; };

  this._popImg(ctx, 'cloud', X(22), Y(-100), 150 * s, 105 * s);
  this._popImg(ctx, 'fish_gray', X(462), Y(-96), 128 * s, 81 * s);
  this._popImg(ctx, 'bell_small', X(586), Y(2), 62 * s, 65 * s);
  this._popImg(ctx, 'cat_black', X(206), Y(-144), 225 * s, 196 * s);

  this._popImg(ctx, 'panel_lose', px, py, PW * s, PH * s);

  D.label(ctx, I.t('loseTitle'), X(320), Y(122), 60 * s, '#3E2A22', {
    stroke: 'rgba(255,250,242,0.8)', strokeW: 6 * s, maxW: 460 * s
  });
  var gap = this._scoreGap || 0;
  D.label(ctx, I.t('loseSub', { n: gap }), X(320), Y(206), 33 * s, '#6B4A38', {
    maxW: 420 * s
  });

  var by = Y(276), bh = 80;
  this._popBtn(ctx, 'retry', I.t('loseRetry'), X(56), by, 240 * s, bh * s, 'orange', s);
  this._popBtn(ctx, 'home', I.t('loseExit'), X(346), by, 240 * s, bh * s, 'cream', s);

  // 面板下方：两张道具加成卡（设计稿 146x71@1x，横排居中）
  var cw = 280, ch = 78, gapX = 16;
  var cy = Y(PH + 20);
  var chips = ['prop_yarn', 'prop_bomb'];
  var tips = ['useYarnBoost', 'useBombBoost'];
  for (var i = 0; i < 2; i++) {
    var cx = X(32) + i * (cw + gapX) * s;
    var yy = cy;
    var rr = ch * 0.5 * s;
    ctx.fillStyle = 'rgba(60,40,30,0.32)';
    D.roundRect(ctx, cx + 2 * s, yy + 3 * s, cw * s, ch * s, rr); ctx.fill();
    ctx.fillStyle = '#FFF7E8';
    D.roundRect(ctx, cx, yy, cw * s, ch * s, rr); ctx.fill();
    ctx.strokeStyle = '#7A4A32'; ctx.lineWidth = 2.2 * s;
    D.roundRect(ctx, cx, yy, cw * s, ch * s, rr); ctx.stroke();
    this._popImg(ctx, chips[i], cx + 6 * s, yy + 3 * s, 66 * s, (ch - 6) * s);
    D.label(ctx, I.t(tips[i], { n: 500 }), cx + 86 * s, yy + ch * 0.5 * s,
      22 * s, '#8A4A22', { align: 'left', maxW: (cw - 98) * s });
  }
};

/** 暂停 / 道具商店（原有样式） */
Play.prototype._popupMenu = function (ctx, W, H) {
  var pw = W * 0.78, ph = 320, px = (W - pw) / 2, py = (H - ph) / 2;
  Cozy.plate(ctx, px, py, pw, ph, 24);

  if (this.popup === 'pause') {
    Cozy.title(ctx, I.t('paused'), W / 2, py + 56, 26);
    this.popupBtns.push({ key: 'resume', text: I.t('resumeBtn'), x: W / 2 - 105, y: py + 120, w: 210, h: 52, color: '#7ec8c0', color2: '#9ad8d2' });
    this.popupBtns.push({ key: 'retry', text: I.t('restartBtn'), x: W / 2 - 105, y: py + 184, w: 210, h: 46, color: '#f0b060', color2: '#f8c88a', fontSize: 18 });
    this.popupBtns.push({ key: 'home', text: I.t('backHomeBtn'), x: W / 2 - 105, y: py + 240, w: 210, h: 42, color: '#c8b8a8', color2: '#d8ccc0', fontSize: 17 });
  } else if (this.popup === 'shop') {
    Cozy.title(ctx, I.t('shopTitle'), W / 2, py + 46, 24);
    D.text(ctx, I.t('coinWith', { n: Save.get('coin') }), W / 2, py + 80, 16, '#A1663C');
    var goods = [
      { key: 'buy_hint', text: I.t('buyFmt', { name: I.t('propHint'), n: 50 }), cost: 50 },
      { key: 'buy_shuffle', text: I.t('buyFmt', { name: I.t('propShuffle'), n: 100 }), cost: 100 },
      { key: 'buy_bomb', text: I.t('buyFmt', { name: I.t('propBomb'), n: 120 }), cost: 120 },
      { key: 'buy_time', text: I.t('buyFmt', { name: I.t('propTime'), n: 80 }), cost: 80 }
    ];
    this.shopGoods = goods;
    for (var gi = 0; gi < goods.length; gi++) {
      var row = { key: goods[gi].key, text: goods[gi].text, x: px + 24, y: py + 100 + gi * 44, w: pw - 48, h: 36, color: '#ffd9a8', color2: '#ffe8c8', fontSize: 15, textColor: '#8a5a20' };
      this.popupBtns.push(row);
    }
    this.popupBtns.push({ key: 'closeShop', text: I.t('closeBtn'), x: W / 2 - 60, y: py + 280, w: 120, h: 34, color: '#c8b8a8', color2: '#d8ccc0', fontSize: 15 });
  }

  // 弹窗按钮：与主界面同款软糖圆角按钮
  for (var b = 0; b < this.popupBtns.length; b++) {
    var btn = this.popupBtns[b];
    var primary = btn.key === 'resume' || btn.key === 'retry' || btn.key.indexOf('buy_') === 0;
    ctx.save();
    if (btn._pressed) {
      ctx.translate(btn.x + btn.w / 2, btn.y + btn.h / 2);
      ctx.scale(0.96, 0.96);
      ctx.translate(-(btn.x + btn.w / 2), -(btn.y + btn.h / 2));
    }
    Cozy.toolBtn(ctx, btn.x, btn.y, btn.w, btn.h,
      primary ? '#FFE5B4' : '#FFF6E8',
      primary ? '#FFC37C' : '#F4DEC0',
      'rgba(226,166,112,0.85)');
    D.text(ctx, btn.text, btn.x + btn.w / 2, btn.y + btn.h / 2,
      btn.fontSize || 17, '#7A4A2C');
    ctx.restore();
  }
};

// ---------------- 输入 ----------------
Play.prototype.onTouchDown = function (x, y) {
  var press = function (arr) {
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) arr[i]._pressed = D.hit(arr[i], x, y);
  };
  if (this.popup) { press(this.popupBtns); return; }
  press([this.backBtn, this.pauseBtn]);
  press(this.itemBtns);
};

Play.prototype.onTouchUp = function (x, y) {
  var self = this;
  function release(arr, fn) {
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      b._pressed = false;
      if (D.hit(b, x, y) && fn) fn(b);
    }
  }
  if (this.popup) {
    release(this.popupBtns, function (b) {
      switch (b.key) {
        case 'next': self.level++; self.onShow({ level: self.level }); break;
        case 'retry': self.onShow({ level: self.level }); break;
        case 'home': self.engine.goto('home'); break;
        case 'resume': self.popup = null; break;
        case 'shop': self.popup = 'shop'; break;
        case 'closeShop': self.popup = self.game.state === 'lose' ? 'lose' : null; break;
        default:
          if (b.key.indexOf('buy_') === 0) {
            var type = b.key.slice(4);
            var cost = { hint: 50, shuffle: 100, bomb: 120, time: 80 }[type];
            if (Save.spendCoin(cost)) {
              Save.get('props')[type] = (Save.get('props')[type] || 0) + 1;
              Save.save();
              self.engine.toast(I.t('boughtOk2'));
            } else self.engine.toast(I.t('noCoinShort'));
          }
      }
    });
    return;
  }
  release([this.backBtn, this.pauseBtn], function (b) {
    if (b.key === 'back') self.engine.goto('home');
    else if (b.key === 'pause') self.popup = 'pause';
  });
  release(this.itemBtns, function (b) {
    if (self.bombMode && b.key !== 'bomb') return;
    self.game.useItem(b.key);
  });

  // 棋盘点击
  var gx = Math.floor((x - this.bx) / this.cell);
  var gy = Math.floor((y - this.by) / this.cell);
  if (gx >= 0 && gy >= 0 && gx < this.game.grid.cols && gy < this.game.grid.rows) {
    if (this.bombMode) {
      if (this.game.detonateAt(gy, gx)) this.bombMode = false;
      else this.engine.toast(I.t('tapEmpty'));
    } else {
      this.game.tapCell(gy, gx);
    }
  }
};

module.exports = Play;
