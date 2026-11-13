/**
 * 游戏逻辑层：状态机 / 选中与消除 / 道具 / 计时 / 连击 / 移动元素
 * 场景层通过 game.events 监听变化，并负责渲染表现。
 */
var Grid = require('./grid.js');
var Level = require('./level.js');
var A = require('../adapter.js');

function Game() {
  this.grid = new Grid();
  this.events = {};            // name -> [fn]
  this.reset();
}

Game.prototype.on = function (name, fn) {
  (this.events[name] = this.events[name] || []).push(fn);
};
Game.prototype.emit = function (name, data) {
  var arr = this.events[name];
  if (arr) for (var i = 0; i < arr.length; i++) arr[i](data);
};

Game.prototype.reset = function () {
  this.cfg = null;
  this.score = 0;
  this.combo = 0;
  this.comboTimer = 0;     // 连击窗口（秒）
  this.timeLeft = 0;
  this.stepsLeft = 0;
  this.sel = null;         // 已选中的 {r,c}
  this.state = 'idle';     // idle | playing | win | lose
  this.items = { hint: 0, shuffle: 0, bomb: 0, time: 0 };
  this.hintPair = null;    // 道具高亮
  this.hintTimer = 0;
  this.moveTimer = 0;      // 移动元素计时
  this.elapsed = 0;
};

/**
 * 开局。items 传入账号级存档背包，逻辑层直接在其上扣减，
 * 由场景层监听 itemspent 事件即时落盘；不传则为空背包。
 */
Game.prototype.start = function (levelId, items) {
  this.reset();
  this.cfg = Level.levelConfig(levelId);
  this.grid.generate(this.cfg);
  this.timeLeft = this.cfg.timeLimit;
  this.stepsLeft = this.cfg.stepLimit;
  if (items) {
    var Shop = require('./shop.js');
    this.items = items;
    // 兜底：即使传入的存档对象缺键/异常，也规范为合法非负整数（就地修正存档）
    for (var k = 0; k < Shop.PROP_KEYS.length; k++) {
      var key = Shop.PROP_KEYS[k], n = Number(this.items[key]);
      this.items[key] = isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
  }
  this.state = 'playing';
  this.emit('start', this.cfg);
};

Game.prototype.useScore = function () { return this.score; };

/** 点击某个方块。返回是否发生了有效操作 */
Game.prototype.tapCell = function (r, c) {
  if (this.state !== 'playing') return false;
  var cell = this.grid.at(r, c);
  if (!cell) return false;

  // 冰块：第一次点击破冰
  if (cell.ice) {
    cell.ice = false;
    A.sfx('ice');
    this.emit('icebreak', { r: r, c: c });
    this._checkDead();
    return true;
  }

  // 翻转块：未翻开时先翻转
  if (cell.flip && !cell.revealed) {
    cell.revealed = true;
    A.sfx('flip');
    this.emit('flip', { r: r, c: c });
    return true;
  }

  // 锁链块：不可选中
  if (cell.chain) {
    A.sfx('error');
    this.emit('shake', { r: r, c: c });
    return false;
  }

  // 第二次点击：判定
  if (this.sel) {
    var sr = this.sel.r, sc = this.sel.c;
    if (sr === r && sc === c) { // 取消选中
      this.sel = null;
      this.emit('deselect');
      return true;
    }
    var path = this.grid.connect(sr, sc, r, c);
    this.sel = null;
    if (path) {
      this._doMatch(sr, sc, r, c, path);
      return true;
    } else {
      A.sfx('error');
      this.emit('mismatch', [{ r: sr, c: sc }, { r: r, c: c }]);
      // 翻转块配对失败则重新盖回
      var ca = this.grid.at(sr, sc), cb = this.grid.at(r, c);
      if (ca && ca.flip) { ca.revealed = false; this.emit('flipback', { r: sr, c: sc }); }
      if (cb && cb.flip) { cb.revealed = false; this.emit('flipback', { r: r, c: c }); }
      return false;
    }
  }

  // 第一次点击
  this.sel = { r: r, c: c };
  A.sfx('select');
  this.emit('select', { r: r, c: c });
  return true;
};

Game.prototype._doMatch = function (r1, c1, r2, c2, path) {
  var g = this.grid;
  var a = g.at(r1, c1), b = g.at(r2, c2);
  var bombCells = [];

  // 连击
  if (this.comboTimer > 0) this.combo++; else this.combo = 1;
  this.comboTimer = 3.0;
  if (this.combo > (this.maxCombo || 0)) this.maxCombo = this.combo;

  var base = 10;
  var gain = Math.round(base * Math.pow(1.2, this.combo - 1) * (1 + (this.comboBonus || 0)));
  this.score += gain;

  var bombAt = a.bomb ? [r1, c1] : b.bomb ? [r2, c2] : null;

  g.set(r1, c1, null);
  g.set(r2, c2, null);
  // 炸弹块：在正常配对之外，额外随机炸掉一对同图案方块
  if (bombAt) {
    bombCells = g.explodeRandomPair();
    if (bombCells.length) {
      A.sfx('bomb');
      this.emit('bomb', { r: bombAt[0], c: bombAt[1], cells: bombCells });
    }
  }
  this._boardChanged();
  A.sfx(this.combo > 1 ? 'combo' : 'match');

  // 锁链：相邻方块被消除时打破锁链
  var unlocked = g.breakChainsAround(r1, c1).concat(g.breakChainsAround(r2, c2));
  for (var bi = 0; bi < bombCells.length; bi++)
    unlocked = unlocked.concat(g.breakChainsAround(bombCells[bi][0], bombCells[bi][1]));

  this.emit('match', {
    r1: r1, c1: c1, r2: r2, c2: c2, path: path,
    gain: gain, combo: this.combo, unlocked: unlocked,
    imgs: [a.img, b.img]
  });

  // 步数
  if (this.cfg.stepLimit > 0) {
    this.stepsLeft--;
    if (this.stepsLeft <= 0) { this._fail('steps'); return; }
  }
  this._checkWin();
  this._checkDead();
};

Game.prototype._checkWin = function () {
  if (this.grid.remainCount() === 0) {
    this.state = 'win';
    A.sfx('win');
    this.emit('win', { score: this.score, timeLeft: this.timeLeft });
  }
};

Game.prototype._checkDead = function () {
  if (this.state !== 'playing') return;
  if (this.grid.remainCount() > 0 && !this.grid.findAnyPair()) {
    // 先尝试自动松开锁链（避免只剩锁链块导致永久死局）
    if (this.grid.hasChain()) {
      var unlocked = this.grid.breakAllChains();
      this.emit('chainloose', unlocked);
      if (this.grid.findAnyPair()) return;
    }
    this.grid.shuffle();
    this._boardChanged();
    this.emit('autoshuffle');
  }
};

Game.prototype._fail = function (reason) {
  if (this.state !== 'playing') return;
  this.state = 'lose';
  A.sfx('lose');
  this.emit('lose', { reason: reason });
};

/** 每帧推进（dt 秒） */
Game.prototype.update = function (dt) {
  if (this.state !== 'playing') return;
  this.elapsed += dt;

  if (this.comboTimer > 0) {
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
  }
  if (this.hintTimer > 0) {
    this.hintTimer -= dt;
    if (this.hintTimer <= 0) this.hintPair = null;
  }
  if (this.cfg.timeLimit > 0) {
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this._fail('time'); return; }
  }
  // 移动元素：每 10 秒随机交换
  if (this.cfg.specials.indexOf('move') >= 0) {
    this.moveTimer += dt;
    if (this.moveTimer >= 10) {
      this.moveTimer = 0;
      var sw = this.grid.swapRandomMoves();
      if (sw) { this._boardChanged(); this.emit('moveswap', sw); }
      // 交换后可能出现死局
      this._checkDead();
    }
  }
};

// ---------------- 道具 ----------------
/** 安全取数量：undefined / NaN / 负数一律视为 0 */
Game.prototype._itemCount = function (type) {
  var n = Number(this.items[type]);
  return isFinite(n) && n > 0 ? n : 0;
};

/** 棋盘布局变化后清掉提示高亮与选中，避免高亮指向错误格子 */
Game.prototype._boardChanged = function () {
  this.hintPair = null;
  this.hintTimer = 0;
  this.sel = null;
};

/** 扣减一个道具并广播，场景层据此即时落盘 */
Game.prototype._spendItem = function (type) {
  this.items[type] = Math.max(0, this._itemCount(type) - 1);
  this.emit('itemspent', { type: type, left: this.items[type] });
};

Game.prototype.useItem = function (type) {
  if (this.state !== 'playing') return false;
  if (this._itemCount(type) <= 0) { this.emit('itemfail', { type: type, reason: 'none' }); return false; }
  switch (type) {
    case 'hint': {
      var pair = this.grid.findAnyPair();
      if (!pair) { this.emit('itemfail', { type: type, reason: 'noPair' }); return false; }
      this._spendItem('hint');
      this.hintPair = pair;
      this.hintTimer = 5;
      A.sfx('select');
      this.emit('hint', pair);
      return true;
    }
    case 'shuffle': {
      this._spendItem('shuffle');
      this.grid.shuffle();
      this._boardChanged();
      A.sfx('shuffle');
      this.emit('shuffle');
      return true;
    }
    case 'bomb': {
      // 由场景进入/退出“选择引爆目标”模式（真正引爆时才扣数量）
      if (this._itemCount('bomb') <= 0) return false;
      this.emit('bombmode');
      return true;
    }
    case 'time': {
      if (this.cfg.timeLimit <= 0) { this.emit('itemfail', { type: type, reason: 'noTimeMode' }); return false; }
      this._spendItem('time');
      this.timeLeft += 30;
      A.sfx('select');
      this.emit('addtime', 30);
      return true;
    }
  }
  return false;
};

/** 炸弹道具：炸掉指定格，并随机炸掉一个同图案方块（成对消除） */
Game.prototype.detonateAt = function (r, c) {
  if (!this.confirmBombMode()) {
    this.emit('itemfail', { type: 'bomb', reason: 'noBombItem' });
    return false;
  }
  if (!this.grid.at(r, c)) {
    this.emit('itemfail', { type: 'bomb', reason: 'empty' });
    return false;
  }
  this._spendItem('bomb');
  var cells = this.grid.explodePair(r, c);
  this._boardChanged();
  // 炸掉后可能解锁相邻锁链
  var unlocked = [];
  for (var i = 0; i < cells.length; i++)
    unlocked = unlocked.concat(this.grid.breakChainsAround(cells[i][0], cells[i][1]));
  this.score += cells.length * 5;
  A.sfx('bomb');
  this.emit('bomb', { r: r, c: c, cells: cells, unlocked: unlocked, fromItem: true });
  this._checkWin();
  this._checkDead();
  return true;
};

Game.prototype.confirmBombMode = function () {
  return this._itemCount('bomb') > 0 && this.state === 'playing';
};

module.exports = Game;
