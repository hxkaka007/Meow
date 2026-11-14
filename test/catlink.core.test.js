/**
 * catlink 玩法核心逻辑：grid 连线 / game 对局 / level 关卡 / save 存档。
 * 纯 Node 单测，不加载渲染引擎、不安装 wx/canvas 替身；
 * 同时做 1..300 关配置与棋盘的全量扫描。
 */
'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('path');
var envMod = require('./env.js');

var ROOT = path.resolve(__dirname, '..');
var JS_DIR = path.join(ROOT, 'js') + path.sep;

function cell(img) {
  return {
    img: img, ice: false, chain: false, flip: false,
    revealed: true, move: false, bomb: false
  };
}

/** 清掉 js/ 下的模块缓存，隔离 Save / adapter 这类模块级单例 */
function fresh(name) {
  Object.keys(require.cache).forEach(function (id) {
    if (id.indexOf(JS_DIR) === 0) delete require.cache[id];
  });
  return require(path.join(ROOT, 'js', 'core', name + '.js'));
}

function deterministic(t, seed) {
  var restoreRandom = envMod.seedRandom(seed);
  var clock = envMod.makeClock(Date.parse('2026-01-01T12:00:00+08:00'));
  clock.install();
  t.after(function () { clock.restore(); restoreRandom(); });
  return clock;
}

function blankGrid(rows, cols) {
  var Grid = fresh('grid');
  var g = new Grid();
  g.rows = rows; g.cols = cols; g.cells = [];
  for (var i = 0; i < rows * cols; i++) g.cells.push(null);
  return g;
}

/** 覆盖 5 个阶段的全部关卡号，外加超大关卡号验证无尽期公式不溢出 */
function allIds() {
  var ids = [];
  for (var i = 1; i <= 300; i++) ids.push(i);
  return ids.concat([301, 500, 1000, 10000]);
}

/* ------------------------- 基础玩法基线 ------------------------- */

test('逻辑层在纯 Node 下无需任何 wx / canvas mock 即可加载', function (t) {
  assert.equal(typeof wx, 'undefined');
  assert.equal(typeof window, 'undefined');
  deterministic(t, 1);
  var Game = fresh('game');
  assert.ok(new Game());
});

test('关卡配置的阶段边界符合 docs/catlink.md 基线', function (t) {
  deterministic(t, 7);
  var Level = fresh('level');
  var cases = [
    { id: 1, time: 180, steps: 0, specials: [] },
    { id: 10, time: 180, steps: 0, specials: [] },
    { id: 20, time: 150, steps: 0, specials: ['ice'] },
    { id: 40, time: 0, steps: 24, specials: ['ice', 'chain'] },
    { id: 50, time: 0, steps: 24, has: ['ice', 'chain', 'flip'] },
    { id: 70, time: 210, steps: 25, has: ['ice', 'chain', 'flip', 'move'] },
    { id: 101, hasTime: true }
  ];
  cases.forEach(function (c) {
    var cfg = Level.levelConfig(c.id);
    assert.deepEqual(cfg.grid, [6, 6], '关卡 ' + c.id + ' 棋盘恒为 6x6');
    assert.ok(cfg.kinds > 0 && cfg.kinds <= Level.IMG_COUNT);
    if ('time' in c) assert.equal(cfg.timeLimit, c.time, '关卡 ' + c.id + ' 时间限制');
    if ('steps' in c) assert.equal(cfg.stepLimit, c.steps, '关卡 ' + c.id + ' 步数限制');
    if (c.specials) assert.deepEqual(cfg.specials, c.specials, '关卡 ' + c.id + ' 特殊元素');
    (c.has || []).forEach(function (s) {
      assert.ok(cfg.specials.indexOf(s) >= 0, '关卡 ' + c.id + ' 应含 ' + s);
    });
    if (c.hasTime) assert.ok(cfg.timeLimit >= 120);
  });
});

test('connect 判定 0 拐点、不同图案、同格与外圈绕行', function () {
  var g = blankGrid(3, 3);
  g.set(0, 0, cell(1));
  g.set(0, 1, cell(1));
  assert.deepEqual(g.connect(0, 0, 0, 1), [[0, 0], [0, 1]]);

  g.set(0, 1, cell(2));
  assert.equal(g.connect(0, 0, 0, 1), null, '不同图案不可连');
  assert.equal(g.connect(0, 0, 0, 0), null, '同一格不可连');

  // 直线被挡，但可经棋盘外圈 2 拐点绕行
  g.set(0, 2, cell(1));
  assert.equal(g._clearLine(0, 0, 0, 2), false, '中间方块阻挡直线');
  var path = g.connect(0, 0, 0, 2);
  assert.ok(path, '外圈视为可通行');
  assert.equal(path.length, 4, '2 拐点路径含 4 个点');
  assert.ok(g.findAnyPair(), 'findAnyPair 应找到这一对');
});

test('generate 对任意关卡都给出成对、有解的 36 格棋盘', function (t) {
  deterministic(t, 2026);
  var Grid = fresh('grid');
  var Level = fresh('level');
  [1, 20, 50, 70, 120, 300].forEach(function (id) {
    var g = new Grid();
    g.generate(Level.levelConfig(id));
    assert.equal(g.rows, 6);
    assert.equal(g.cols, 6);
    assert.equal(g.remainCount(), 36, '关卡 ' + id + ' 应有 36 格');
    var count = {};
    g.cells.forEach(function (c) { count[c.img] = (count[c.img] || 0) + 1; });
    Object.keys(count).forEach(function (k) {
      assert.equal(count[k] % 2, 0, '关卡 ' + id + ' 图案 ' + k + ' 必须成对');
    });
    assert.ok(g.findAnyPair(), '关卡 ' + id + ' 开局必须有解');
  });
});

test('Game 选中 / 取消 / 失配 / 匹配 / 清空通关', function (t) {
  deterministic(t, 3);
  var Game = fresh('game');
  var g = new Game();
  g.start(1, { hint: 1, shuffle: 1, bomb: 1, time: 1 });
  g.grid.rows = 2; g.grid.cols = 2;
  g.grid.cells = [cell(1), cell(1), null, null];

  var ev = {};
  ['select', 'deselect', 'mismatch', 'match', 'win'].forEach(function (n) {
    g.on(n, function () { ev[n] = (ev[n] || 0) + 1; });
  });

  assert.equal(g.tapCell(0, 0), true);
  assert.equal(g.tapCell(0, 0), true, '再点一次取消选中');
  assert.equal(g.tapCell(0, 1), true);
  assert.equal(g.tapCell(0, 0), true, '配对成功');

  assert.equal(ev.select, 2);
  assert.equal(ev.deselect, 1);
  assert.equal(ev.match, 1);
  assert.equal(ev.win, 1);
  assert.equal(g.score, 10);
  assert.equal(g.grid.remainCount(), 0);
  assert.equal(g.state, 'win');

  var g2 = new Game();
  g2.start(1);
  g2.grid.rows = 2; g2.grid.cols = 2;
  g2.grid.cells = [cell(1), cell(2), cell(1), cell(2)];
  var mismatch = 0;
  g2.on('mismatch', function () { mismatch++; });
  g2.tapCell(0, 0);
  assert.equal(g2.tapCell(0, 1), false, '不同图案应判定失配');
  assert.equal(mismatch, 1);
  assert.equal(g2.score, 0);
  assert.equal(g2.sel, null);
});

test('Game 倒计时归零与道具扣减 / 炸弹成对消除', function (t) {
  deterministic(t, 11);
  var Game = fresh('game');
  var g = new Game();
  var reason = null;
  g.start(1);
  g.on('lose', function (d) { reason = d.reason; });
  g.update(181);
  assert.equal(g.state, 'lose');
  assert.equal(reason, 'time');

  var g2 = new Game();
  g2.start(1, { hint: 2, shuffle: 1, bomb: 1, time: 1 });
  var spent = [];
  g2.on('itemspent', function (d) { spent.push(d.type); });

  assert.equal(g2.useItem('hint'), true);
  assert.ok(g2.hintPair, '提示应给出一对可消除方块');
  assert.equal(g2.items.hint, 1);

  var before = g2.timeLeft;
  assert.equal(g2.useItem('time'), true);
  assert.equal(g2.timeLeft, before + 30);

  var remain = g2.grid.remainCount();
  assert.equal(g2.detonateAt(0, 0), true);
  assert.equal(g2.items.bomb, 0);
  assert.ok(g2.grid.remainCount() <= remain - 1, '炸弹至少消除一格');
  assert.ok(g2.score >= 5);

  assert.equal(g2.useItem('shuffle'), true);
  assert.ok(g2.grid.findAnyPair(), '洗牌后必须仍有解');
  assert.deepEqual(spent, ['hint', 'time', 'bomb', 'shuffle']);
});

test('Save 每日奖励判重、喵币扣减与重玩不发奖', function (t) {
  deterministic(t, 5);
  var Save = fresh('save');
  assert.equal(Save.get('coin'), 300);

  var first = Save.claimDailyRewards();
  assert.ok(first && first.coin > 0);
  assert.equal(Save.claimDailyRewards(), null, '同一天不可重复领取');
  assert.equal(Save.get('props').hint, 2, '默认 1 + 每日赠礼 1');

  assert.equal(Save.spendCoin(100), true);
  assert.equal(Save.spendCoin(1e9), false, '余额不足不扣币');

  var coin = Save.get('coin');
  var w1 = Save.onWin(1, 100, 30, 0, 2);
  assert.equal(w1.replay, false);
  assert.equal(Save.get('maxLevel'), 2);
  assert.ok(Save.get('coin') > coin);

  var coin2 = Save.get('coin');
  var w2 = Save.onWin(1, 100, 30, 0, 2);
  assert.equal(w2.replay, true);
  assert.equal(w2.total, 0, '重玩已通关关卡不发喵币');
  assert.equal(Save.get('coin'), coin2);
});

/* ------------------------- 全关卡扫描 ------------------------- */

test('1..300 关与超大关卡号的配置全部符合玩法基线', function (t) {
  deterministic(t, 2026);
  var Level = fresh('level');
  allIds().forEach(function (id) {
    var cfg = Level.levelConfig(id);
    assert.deepEqual(cfg.grid, [6, 6], '关卡 ' + id + ' 棋盘恒为 6x6');
    assert.ok(cfg.kinds >= 8 && cfg.kinds <= Level.IMG_COUNT, '关卡 ' + id + ' 图案种类');

    if (id <= 10) {
      assert.equal(cfg.timeLimit, 180, '关卡 ' + id);
      assert.equal(cfg.stepLimit, 0);
      assert.deepEqual(cfg.specials, []);
    } else if (id <= 30) {
      assert.equal(cfg.timeLimit, 150, '关卡 ' + id);
      assert.equal(cfg.stepLimit, 0);
      assert.deepEqual(cfg.specials, ['ice']);
    } else if (id <= 45) {
      assert.equal(cfg.timeLimit, 0, '关卡 ' + id);
      assert.equal(cfg.stepLimit, 24);
      assert.deepEqual(cfg.specials, ['ice', 'chain']);
    } else if (id <= 60) {
      assert.equal(cfg.timeLimit, 0, '关卡 ' + id);
      assert.equal(cfg.stepLimit, 24);
      assert.deepEqual(cfg.specials, ['ice', 'chain', 'flip']);
    } else if (id <= 100) {
      assert.equal(cfg.timeLimit, 210, '关卡 ' + id);
      assert.equal(cfg.stepLimit, 25);
      assert.deepEqual(cfg.specials, ['ice', 'chain', 'flip', 'move']);
    } else {
      assert.equal(cfg.stepLimit, 0, '关卡 ' + id);
      assert.ok(cfg.timeLimit >= 120 && cfg.timeLimit <= 210, '关卡 ' + id + ' 无尽期时间下限');
      assert.ok(cfg.specials.length >= 2 && cfg.specials.length <= 5, '关卡 ' + id + ' 特殊元素数量');
    }
    if (cfg.specials.indexOf('bomb') >= 0) assert.equal(cfg.bombChance, 0.15);
  });
});

test('1..300 关生成的棋盘都成对、36 格且开局有解', function (t) {
  deterministic(t, 99);
  var Grid = fresh('grid');
  var Level = fresh('level');
  for (var id = 1; id <= 300; id++) {
    var g = new Grid();
    g.generate(Level.levelConfig(id));
    assert.equal(g.remainCount(), 36, '关卡 ' + id + ' 应有 36 格');
    var count = {};
    g.cells.forEach(function (c) { count[c.img] = (count[c.img] || 0) + 1; });
    Object.keys(count).forEach(function (k) {
      assert.equal(count[k] % 2, 0, '关卡 ' + id + ' 图案 ' + k + ' 必须成对');
    });
    assert.ok(g.findAnyPair(), '关卡 ' + id + ' 开局必须有解');
  }
});
