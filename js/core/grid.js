/**
 * 棋盘核心：生成 / 连通判定 / 死局检测 / 洗牌
 * cell 结构：
 *   { img:int(1..24 雪碧图帧), ice:bool, chain:bool, flip:bool, revealed:bool, move:bool, bomb:bool }
 * cell 为 null 表示空格。棋盘外圈视为可通行（经典连连看外围连线）。
 */
var Level = require('./level.js');

function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function Grid() {
  this.rows = 0;
  this.cols = 0;
  this.cells = [];   // 一维数组 rows*cols
  this.imgIds = [];  // 本关用到的图片 id
}

Grid.prototype.at = function (r, c) {
  if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
  return this.cells[r * this.cols + c];
};
Grid.prototype.set = function (r, c, v) { this.cells[r * this.cols + c] = v; };
Grid.prototype.isEmpty = function (r, c) { return this.at(r, c) === null; };

/** 生成关卡 */
Grid.prototype.generate = function (cfg) {
  this.rows = cfg.grid[0];
  this.cols = cfg.grid[1];
  var total = this.rows * this.cols;
  var pairs = total / 2;

  // 随机抽取 N 种图片（从全图库随机抽样，而非固定前 N 个）
  var allIds = Level.KINDS.slice();
  for (var sh = allIds.length - 1; sh > 0; sh--) {
    var shj = Math.floor(Math.random() * (sh + 1));
    var sht = allIds[sh]; allIds[sh] = allIds[shj]; allIds[shj] = sht;
  }
  this.imgIds = allIds.slice(0, cfg.kinds);
  var chosen = [];
  var pool = this.imgIds.slice();
  for (var i = 0; i < pairs; i++) {
    if (pool.length === 0) pool = this.imgIds.slice();
    var k = ri(0, pool.length - 1);
    chosen.push(pool[k]);
    if (i % 2 === 1 && Math.random() < 0.55) pool.splice(k, 1); // 适度分散
  }
  var deck = chosen.concat(chosen.slice());
  // 洗乱
  for (var j = deck.length - 1; j > 0; j--) {
    var jj = Math.floor(Math.random() * (j + 1));
    var t = deck[j]; deck[j] = deck[jj]; deck[jj] = t;
  }

  this.cells = new Array(total);
  for (var r = 0; r < this.rows; r++)
    for (var c = 0; c < this.cols; c++)
      this.set(r, c, { img: deck[r * this.cols + c], ice: false, chain: false, flip: false, revealed: true, move: false, bomb: false });

  // 叠加特殊元素
  var spots = [];
  for (var s = 0; s < total; s++) spots.push(s);
  for (var a = spots.length - 1; a > 0; a--) {
    var b = Math.floor(Math.random() * (a + 1));
    var tt = spots[a]; spots[a] = spots[b]; spots[b] = tt;
  }
  var si = 0;
  var take = function () { return si < spots.length ? spots[si++] : -1; };
  var ratio = Math.min(0.3, 0.06 + cfg.id * 0.002);
  if (cfg.specials.indexOf('ice') >= 0) {
    var nIce = Math.floor(total * ratio * 0.6);
    for (var x1 = 0; x1 < nIce; x1++) { var p1 = take(); if (p1 >= 0) this.cells[p1].ice = true; }
  }
  if (cfg.specials.indexOf('chain') >= 0) {
    var nChain = Math.floor(total * ratio * 0.4);
    for (var x2 = 0; x2 < nChain; x2++) { var p2 = take(); if (p2 >= 0) this.cells[p2].chain = true; }
  }
  if (cfg.specials.indexOf('flip') >= 0) {
    var nFlip = Math.floor(total * ratio * 0.5);
    for (var x3 = 0; x3 < nFlip; x3++) {
      var p3 = take();
      if (p3 >= 0) { this.cells[p3].flip = true; this.cells[p3].revealed = false; }
    }
  }
  if (cfg.specials.indexOf('move') >= 0) {
    var nMove = Math.floor(total * ratio * 0.5);
    for (var x4 = 0; x4 < nMove; x4++) { var p4 = take(); if (p4 >= 0) this.cells[p4].move = true; }
  }
  if (cfg.specials.indexOf('bomb') >= 0 && cfg.bombChance) {
    var nBomb = Math.floor(total * cfg.bombChance * 0.3);
    for (var x5 = 0; x5 < nBomb; x5++) { var p5 = take(); if (p5 >= 0) this.cells[p5].bomb = true; }
  }

  // 死局保障
  var guard = 0;
  while (!this.findAnyPair() && guard++ < 50) this.relayout();
  return this;
};

Grid.prototype.remainCount = function () {
  var n = 0;
  for (var i = 0; i < this.cells.length; i++) if (this.cells[i]) n++;
  return n;
};

/** 该格是否阻挡连线（任何剩余方块都阻挡） */
Grid.prototype._blocked = function (r, c) {
  return this.at(r, c) !== null;
};

/** 直线畅通（不含端点） */
Grid.prototype._clearLine = function (r1, c1, r2, c2) {
  if (r1 === r2) {
    var a = Math.min(c1, c2), b = Math.max(c1, c2);
    for (var c = a + 1; c < b; c++) if (this._blocked(r1, c)) return false;
    return true;
  }
  if (c1 === c2) {
    var a2 = Math.min(r1, r2), b2 = Math.max(r1, r2);
    for (var r = a2 + 1; r < b2; r++) if (this._blocked(r, c1)) return false;
    return true;
  }
  return false;
};

/**
 * 经典连连看连通判定：0/1/2 个拐点，坐标可为 -1..rows（棋盘外圈）
 * 返回路径拐点数组（逻辑坐标，含端点），不可连返回 null
 */
Grid.prototype.connect = function (r1, c1, r2, c2) {
  if (r1 === r2 && c1 === c2) return null;
  var va = this.at(r1, c1), vb = this.at(r2, c2);
  if (!va || !vb || va.img !== vb.img) return null;

  var R = this.rows, C = this.cols;
  var self = this;
  function inside(r, c) { return r >= 0 && r < R && c >= 0 && c < C; }

  // 0 拐点
  if ((r1 === r2 || c1 === c2) && this._clearLine(r1, c1, r2, c2))
    return [[r1, c1], [r2, c2]];

  // 1 拐点：两个候选角
  var corners1 = [[r1, c2], [r2, c1]];
  for (var i = 0; i < 2; i++) {
    var cr = corners1[i][0], cc = corners1[i][1];
    var cornerFree = inside(cr, cc) ? !this._blocked(cr, cc) : true; // 外圈视为空
    if (cornerFree &&
        this._clearLine(r1, c1, cr, cc) &&
        this._clearLine(cr, cc, r2, c2))
      return [[r1, c1], [cr, cc], [r2, c2]];
  }

  // 2 拐点：沿 r1 行 / c1 列扫描中间线
  // 情况A：中间线为行 m（水平中转）
  for (var m = -1; m <= R; m++) {
    if (m === r1 || m === r2) continue;
    var f1 = (m === -1 || m === R) ? true : !this._blocked(m, c1);
    var f2 = (m === -1 || m === R) ? true : !this._blocked(m, c2);
    if (f1 && f2 &&
        this._clearLine(r1, c1, m, c1) &&
        this._clearLine(m, c1, m, c2) &&
        this._clearLine(m, c2, r2, c2))
      return [[r1, c1], [m, c1], [m, c2], [r2, c2]];
  }
  // 情况B：中间线为列 n（垂直中转）
  for (var n = -1; n <= C; n++) {
    if (n === c1 || n === c2) continue;
    var g1 = (n === -1 || n === C) ? true : !this._blocked(r1, n);
    var g2 = (n === -1 || n === C) ? true : !this._blocked(r2, n);
    if (g1 && g2 &&
        this._clearLine(r1, c1, r1, n) &&
        this._clearLine(r1, n, r2, n) &&
        this._clearLine(r2, n, r2, c2))
      return [[r1, c1], [r1, n], [r2, n], [r2, c2]];
  }
  return null;
};

/** 找到任意一对可消除的组合，返回 [{r,c,path},...] 或 null */
Grid.prototype.findAnyPair = function () {
  var list = [];
  for (var r = 0; r < this.rows; r++)
    for (var c = 0; c < this.cols; c++) {
      var cell = this.at(r, c);
      if (cell && this.canParticipate(cell)) list.push([r, c]);
    }
  // 按 img 分组提速
  var byImg = {};
  for (var i = 0; i < list.length; i++) {
    var img = this.at(list[i][0], list[i][1]).img;
    (byImg[img] = byImg[img] || []).push(list[i]);
  }
  for (var key in byImg) {
    var arr = byImg[key];
    for (var a = 0; a < arr.length; a++)
      for (var b = a + 1; b < arr.length; b++) {
        var p = this.connect(arr[a][0], arr[a][1], arr[b][0], arr[b][1]);
        if (p) return [{ r: arr[a][0], c: arr[a][1], path: p }, { r: arr[b][0], c: arr[b][1], path: p }];
      }
  }
  return null;
};

/** 可参与匹配的方块（锁链不可匹配；翻转块翻开后可匹配） */
Grid.prototype.canParticipate = function (cell) {
  if (cell.chain) return false;
  return true;
};

/** 是否存在锁链块 */
Grid.prototype.hasChain = function () {
  for (var i = 0; i < this.cells.length; i++)
    if (this.cells[i] && this.cells[i].chain) return true;
  return false;
};

/** 打破所有锁链，返回坐标数组 */
Grid.prototype.breakAllChains = function () {
  var out = [];
  for (var r = 0; r < this.rows; r++)
    for (var c = 0; c < this.cols; c++) {
      var cell = this.at(r, c);
      if (cell && cell.chain) { cell.chain = false; out.push([r, c]); }
    }
  return out;
};

/** 洗牌：重排剩余方块（保证洗后有解） */
Grid.prototype.shuffle = function () {
  var spots = [], vals = [];
  for (var i = 0; i < this.cells.length; i++) {
    if (this.cells[i]) { spots.push(i); vals.push(this.cells[i]); }
  }
  var guard = 0;
  do {
    for (var j = vals.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = vals[j]; vals[j] = vals[k]; vals[k] = t;
    }
    for (var s = 0; s < spots.length; s++) this.cells[spots[s]] = vals[s];
  } while (!this.findAnyPair() && guard++ < 60);
  return true;
};

Grid.prototype.relayout = function () { this.shuffle(); };

/** 相邻有方块被消除时，打破锁链。返回被解锁的坐标数组 */
Grid.prototype.breakChainsAround = function (r, c) {
  var out = [];
  var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (var d = 0; d < 4; d++) {
    var nr = r + dirs[d][0], nc = c + dirs[d][1];
    var cell = this.at(nr, nc);
    if (cell && cell.chain) { cell.chain = false; out.push([nr, nc]); }
  }
  return out;
};

/** 炸弹：消除 3x3。返回被炸掉的坐标数组 */
Grid.prototype.explode3x3 = function (r, c) {
  var out = [];
  for (var dr = -1; dr <= 1; dr++)
    for (var dc = -1; dc <= 1; dc++) {
      var nr = r + dr, nc = c + dc;
      if (this.at(nr, nc)) { this.set(nr, nc, null); out.push([nr, nc]); }
    }
  return out;
};

/** 移动元素：随机交换两个 move 方块的位置。返回 {a, b} 用于动画 */
Grid.prototype.swapRandomMoves = function () {
  var list = [];
  for (var i = 0; i < this.cells.length; i++) if (this.cells[i] && this.cells[i].move) list.push(i);
  if (list.length < 2) return null;
  var a = list[ri(0, list.length - 1)];
  var b = list[ri(0, list.length - 1)];
  if (a === b) return null;
  var t = this.cells[a]; this.cells[a] = this.cells[b]; this.cells[b] = t;
  return { ia: a, ib: b };
};

module.exports = Grid;
