/**
 * 道具全覆盖：4 种道具的按钮真实点击、事件、即时落盘、失败分支与边界。
 * 文档基线见 docs/catlink.md「道具玩法」。
 */
'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var harness = require('./harness.js');

function withHarness(opts, fn) {
  var h = harness.boot(opts);
  try { return fn(h); } finally { h.finish(); }
}

/** 道具按钮在 Play.render() 里构造，调用前必须先渲染至少一帧 */
function btn(h, key) {
  var list = h.play().itemBtns || [];
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  throw new Error('未找到道具按钮: ' + key);
}
function tapItem(h, key) {
  var b = btn(h, key);
  h.tap(b.x + b.w / 2, b.y + b.h / 2);
  return b;
}
function storedProps(h) {
  return h.env.storage.get('catlink_save_v2').props;
}

test('4 种道具按钮真实点击都生效并即时落盘存档', function () {
  withHarness({ seed: 42 }, function (h) {
    h.goto('play', { level: 1 });      // 限时关，加时按钮可用
    h.step(1);
    var g = h.play().game;
    var p0 = Object.assign({}, g.items);

    tapItem(h, 'hint');
    assert.ok(g.hintPair, '提示应高亮一对');
    assert.equal(g.items.hint, p0.hint - 1);
    assert.equal(storedProps(h).hint, p0.hint - 1, 'itemspent 应立即落盘');

    tapItem(h, 'shuffle');
    assert.ok(g.grid.findAnyPair(), '洗牌后仍应有解');
    assert.equal(g.items.shuffle, p0.shuffle - 1);
    assert.equal(storedProps(h).shuffle, p0.shuffle - 1);

    var t0 = g.timeLeft;
    tapItem(h, 'time');
    assert.ok(g.timeLeft > t0 + 29, '加时应 +30 秒');
    assert.equal(g.items.time, p0.time - 1);
    assert.equal(storedProps(h).time, p0.time - 1);

    // 炸弹：首次点击只进入选格模式，不扣数量
    tapItem(h, 'bomb');
    assert.equal(h.play().bombMode, true);
    assert.equal(g.items.bomb, p0.bomb);
    assert.equal(storedProps(h).bomb, p0.bomb);

    // 点棋盘格引爆，扣 1 并退出选格模式
    var pair = g.grid.findAnyPair();
    var p = pair[0];
    h.tap(h.play()._cx(p.c), h.play()._cy(p.r));
    assert.equal(h.play().bombMode, false);
    assert.equal(g.items.bomb, p0.bomb - 1);
    assert.equal(storedProps(h).bomb, p0.bomb - 1);
    assert.ok(g.grid.remainCount() < 36, '炸弹应消除方块');
    assert.ok(g.score >= 5, '炸弹应计分');

    h.assertNoError();
  });
});

test('再次点击炸弹可退出选格模式且不消耗道具', function () {
  withHarness({ seed: 8 }, function (h) {
    h.goto('play', { level: 1 });
    h.step(1);
    var g = h.play().game;
    var n = g.items.bomb;
    tapItem(h, 'bomb');
    assert.equal(h.play().bombMode, true);
    tapItem(h, 'bomb');
    assert.equal(h.play().bombMode, false);
    assert.equal(g.items.bomb, n);
    h.assertNoError();
  });
});

test('道具不足 / 不限时关加时 / 空格引爆 / 提示无解均不扣道具', function () {
  withHarness({ seed: 3 }, function (h) {
    h.goto('play', { level: 31 });     // 不限时、限步关卡
    h.step(1);
    var g = h.play().game;
    var fails = [];
    g.on('itemfail', function (d) { fails.push(d.reason); });
    g.items = { hint: 0, shuffle: 0, bomb: 0, time: 1 };

    assert.equal(g.useItem('hint'), false);
    assert.equal(fails[fails.length - 1], 'none', '道具不足');
    assert.equal(g.useItem('time'), false);
    assert.equal(fails[fails.length - 1], 'noTimeMode', '不限时关不可加时');
    assert.equal(g.useItem('bomb'), false);
    assert.equal(g.confirmBombMode(), false);
    assert.equal(g.detonateAt(0, 0), false);
    assert.equal(fails[fails.length - 1], 'noBombItem', '炸弹道具不足');
    assert.deepEqual(g.items, { hint: 0, shuffle: 0, bomb: 0, time: 1 }, '失败路径不应扣道具');

    // 有提示道具但当前无可消除组合
    g.items.hint = 1;
    var orig = g.grid.findAnyPair;
    g.grid.findAnyPair = function () { return null; };
    assert.equal(g.useItem('hint'), false);
    assert.equal(fails[fails.length - 1], 'noPair');
    assert.equal(g.items.hint, 1, '无解时不扣提示');
    g.grid.findAnyPair = orig;

    h.assertNoError();
  });
});

test('洗牌会清掉提示高亮；开局背包会被规范化为非负整数', function () {
  withHarness({ seed: 6 }, function (h) {
    h.goto('play', { level: 1 });
    h.step(1);
    var g = h.play().game;
    g.items.hint = 1;
    g.items.shuffle = 1;
    assert.equal(g.useItem('hint'), true);
    assert.ok(g.hintPair);
    assert.equal(g.hintTimer, 5);
    assert.equal(g.useItem('shuffle'), true);
    assert.equal(g.hintPair, null, '棋盘变化后高亮必须清除');
    assert.equal(g.hintTimer, 0);
    assert.equal(g.sel, null);

    g.start(1, { hint: undefined, shuffle: -1, bomb: NaN, time: 2.8 });
    assert.deepEqual(g.items, { hint: 0, shuffle: 0, bomb: 0, time: 2 });
    h.assertNoError();
  });
});

test('不限时关的加时按钮被禁用，点击也不扣道具', function () {
  withHarness({ seed: 9 }, function (h) {
    h.goto('play', { level: 31 });
    h.step(1);
    var g = h.play().game;
    assert.equal(btn(h, 'time').disabled, true);
    var n = g.items.time, t = g.timeLeft;
    tapItem(h, 'time');
    assert.equal(g.items.time, n);
    assert.equal(g.timeLeft, t);
    h.assertNoError();
  });
});
