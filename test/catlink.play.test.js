/**
 * catlink 对局流程：从真实触摸点击自动通关，到暂停 / 商店 / 胜负弹窗 /
 * 失败路径 / 移动元素换位 / 局内购买 / 重玩结算。
 * 按钮坐标一律取自 render() 生成的 x/y/w/h，不硬编码像素。
 */
'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var harness = require('./harness.js');

function withHarness(opts, fn) {
  var h = harness.boot(opts);
  try { return fn(h); } finally { h.finish(); }
}
function btn(list, key) {
  for (var i = 0; i < (list || []).length; i++) {
    if (list[i] && list[i].key === key) return list[i];
  }
  throw new Error('未找到按钮: ' + key);
}
function tapPopup(h, key) {
  var b = btn(h.play().popupBtns, key);
  h.tap(b.x + b.w / 2, b.y + b.h / 2);
}
function tapHud(h, name) {
  var b = h.play()[name === 'pause' ? 'pauseBtn' : 'backBtn'];
  h.tap(b.x + b.w / 2, b.y + b.h / 2);
}
function clearPair(g, pair) {
  pair.forEach(function (p) {
    var c = g.grid.at(p.r, p.c);
    if (c) { c.ice = false; c.flip = false; c.revealed = true; c.chain = false; }
  });
}

/** 逻辑层快速通关，只为把 play 场景推进到 win 弹窗 */
function winFast(h, level) {
  h.goto('play', { level: level });
  h.step(1);
  var g = h.play().game, guard = 0;
  while (g.state === 'playing' && guard++ < 100) {
    var p = g.grid.findAnyPair();
    if (!p) { g._checkDead(); p = g.grid.findAnyPair(); }
    if (!p) break;
    clearPair(g, p);
    g.tapCell(p[0].r, p[0].c);
    g.tapCell(p[1].r, p[1].c);
  }
  h.step(1);
  return h.play().popup;
}

/** 清掉被选中格子的冰 / 翻面 / 锁链；useTouch=false 时直接调 tapCell 做对比 */
function autoPlay(h, level, useTouch) {
  h.goto('play', { level: level });
  h.closeModals();
  h.step(1);                       // Play._layout() 在 render() 里算 bx / by / cell
  var scene = h.play();
  var g = scene.game;
  var guard = 0;
  while (g.state === 'playing' && guard++ < 200) {
    var pair = g.grid.findAnyPair();
    if (!pair) { g._checkDead(); pair = g.grid.findAnyPair(); }
    if (!pair) break;
    clearPair(g, pair);
    var a = pair[0], b = pair[1];
    if (useTouch) {
      h.tap(scene._cx(a.c), scene._cy(a.r));
      h.tap(scene._cx(b.c), scene._cy(b.r));
    } else {
      g.tapCell(a.r, a.c);
      g.tapCell(b.r, b.c);
    }
    h.step(1);
  }
  return { guard: guard, game: g };
}

/** 不清除任何标志：冰块要先破、翻面要先翻，全部用真实触摸完成 */
function autoPlayWithSpecials(h, level) {
  h.goto('play', { level: level });
  h.closeModals();
  h.step(1);
  var scene = h.play(), g = scene.game;
  var guard = 0, pre = 0;
  while (g.state === 'playing' && guard++ < 300) {
    var pair = g.grid.findAnyPair();
    if (!pair) { g._checkDead(); pair = g.grid.findAnyPair(); }
    if (!pair) break;
    var a = pair[0], b = pair[1];
    [a, b].forEach(function (p) {
      for (var k = 0; k < 3; k++) {
        var c = g.grid.at(p.r, p.c);
        if (!c) return;
        if (!c.ice && !(c.flip && !c.revealed)) return;
        h.tap(scene._cx(p.c), scene._cy(p.r));
        pre++;
      }
    });
    // 破冰 / 翻牌可能触发自动洗牌，重新确认这一对仍可连
    if (!g.grid.connect(a.r, a.c, b.r, b.c)) continue;
    h.tap(scene._cx(a.c), scene._cy(a.r));
    h.tap(scene._cx(b.c), scene._cy(b.r));
    h.step(1);
  }
  return { guard: guard, game: g, pre: pre };
}

/* ------------------------- 自动通关 ------------------------- */

test('真实触摸自动通关第 1 关并触发结算与进度写入', function () {
  withHarness({ seed: 42 }, function (h) {
    var before = h.state().save;
    var r = autoPlay(h, 1, true);
    h.step(10);
    var s = h.state();

    assert.equal(r.game.state, 'win', '应自动清空棋盘');
    assert.equal(r.game.grid.remainCount(), 0);
    assert.equal(s.play.state, 'win');
    assert.equal(s.play.popup, 'win', '胜利弹窗应出现');
    assert.ok(s.play.score > 0);
    assert.equal(s.save.maxLevel, before.maxLevel + 1, '通关应解锁下一关');
    assert.ok(s.save.coin > before.coin, '通关应发放喵币');
    assert.ok(s.tapCount >= 36, '18 对至少 36 次真实点击');
    h.assertNoError();
  });
});

test('真实触摸能破冰与翻开翻面块', function () {
  withHarness({ seed: 5 }, function (h) {
    h.goto('play', { level: 11 });
    h.step(1);
    var scene = h.play(), g = scene.game;
    g.grid.at(0, 0).ice = true;
    g.grid.at(0, 1).flip = true;
    g.grid.at(0, 1).revealed = false;

    h.tap(scene._cx(0), scene._cy(0));
    assert.equal(g.grid.at(0, 0).ice, false, '第一次点击只破冰');
    assert.equal(g.sel, null, '破冰不应产生选中');

    h.tap(scene._cx(1), scene._cy(0));
    assert.equal(g.grid.at(0, 1).revealed, true, '第一次点击只翻牌');
    assert.equal(g.sel, null, '翻牌不应产生选中');
    h.assertNoError();
  });
});

test('各难度阶段与不同 seed 都能自动通关', function () {
  [11, 31, 61, 101].forEach(function (level) {
    [7, 42].forEach(function (seed) {
      withHarness({ seed: seed }, function (h) {
        var r = autoPlay(h, level, true);
        assert.equal(r.game.state, 'win', '关卡 ' + level + ' / seed ' + seed + ' 应通关');
        assert.equal(r.game.grid.remainCount(), 0);
        h.assertNoError();
      });
    });
  });
});

test('逻辑层直驱与真实触摸得到一致的通关结果', function () {
  var a = withHarness({ seed: 123 }, function (h) {
    var r = autoPlay(h, 1, false);
    return { state: r.game.state, score: r.game.score, guard: r.guard };
  });
  var b = withHarness({ seed: 123 }, function (h) {
    var r = autoPlay(h, 1, true);
    return { state: r.game.state, score: r.game.score, guard: r.guard };
  });
  assert.equal(a.state, 'win');
  assert.equal(b.state, 'win');
  assert.equal(a.guard, b.guard, '两种驱动方式应走同样的步数');
  assert.equal(a.score, b.score, '两种驱动方式应得到同样的分数');
});

test('5 个难度阶段的所有边界关卡都能自动通关', function () {
  [1, 10, 11, 30, 31, 45, 46, 60, 61, 100, 101, 200].forEach(function (level) {
    withHarness({ seed: 2026 }, function (h) {
      var r = autoPlay(h, level, true);
      assert.equal(r.game.state, 'win', '关卡 ' + level + ' 应通关');
      assert.equal(r.game.grid.remainCount(), 0);
      h.assertNoError();
    });
  });
});

test('不清冰块 / 翻面标志，混合特殊元素也能完整通关', function () {
  [11, 31, 61].forEach(function (level) {
    withHarness({ seed: 2026 }, function (h) {
      var r = autoPlayWithSpecials(h, level);
      assert.equal(r.game.state, 'win', '关卡 ' + level + ' 混合特殊元素应通关');
      assert.equal(r.game.grid.remainCount(), 0);
      assert.ok(r.pre > 0, '关卡 ' + level + ' 应至少处理过一次冰块或翻面');
      h.assertNoError();
    });
  });
});

/* ------------------------- 对局内弹窗与流程 ------------------------- */

test('暂停弹窗可打开并继续游戏', function () {
  withHarness({ seed: 42 }, function (h) {
    h.goto('play', { level: 1 });
    h.step(1);
    tapHud(h, 'pause');
    assert.equal(h.play().popup, 'pause');
    h.step(1);
    assert.ok(btn(h.play().popupBtns, 'resume'), '应渲染暂停菜单');
    tapPopup(h, 'resume');
    assert.equal(h.play().popup, null);
    h.step(1);
    h.assertNoError();
  });
});

test('暂停 -> 局内商店 -> 购买 -> 关闭回到暂停 -> 回主页', function () {
  withHarness({ seed: 42 }, function (h) {
    h.goto('play', { level: 1 });
    h.step(1);
    var Save = harness.core('save');
    var coin0 = Save.get('coin'), hint0 = Save.get('props').hint;

    tapHud(h, 'pause');
    h.step(1);
    tapPopup(h, 'shop');
    assert.equal(h.play().popup, 'shop');
    assert.equal(h.play()._shopFrom, 'pause');
    h.step(1);
    assert.ok(btn(h.play().popupBtns, 'buy_hint'));

    tapPopup(h, 'buy_hint');
    assert.equal(Save.get('coin'), coin0 - 50, '提示道具价格 50');
    assert.equal(Save.get('props').hint, hint0 + 1);
    assert.equal(h.play().game.items.hint, hint0 + 1, '局内背包应重新对齐存档引用');

    h.step(1);
    tapPopup(h, 'closeShop');
    assert.equal(h.play().popup, 'pause', '关闭商店应回到来源弹窗');
    h.step(1);
    tapPopup(h, 'home');
    assert.equal(h.state().scene, 'home');
    h.assertNoError();
  });
});

test('胜利弹窗的下一关 / 选关 / 回主页按钮', function () {
  withHarness({ seed: 42 }, function (h) {
    assert.equal(winFast(h, 1), 'win');
    var lv = h.play().level;
    tapPopup(h, 'next');
    assert.equal(h.play().popup, null);
    assert.equal(h.play().level, lv + 1);
    assert.equal(h.play().game.state, 'playing');

    assert.equal(winFast(h, 1), 'win');
    tapPopup(h, 'select');
    assert.equal(h.state().scene, 'select');

    assert.equal(winFast(h, 1), 'win');
    tapPopup(h, 'home');
    assert.equal(h.state().scene, 'home');
    h.assertNoError();
  });
});

test('时间与步数耗尽会进入失败弹窗，可重试与补充道具', function () {
  withHarness({ seed: 42 }, function (h) {
    h.goto('play', { level: 1 });
    h.step(1);
    var g = h.play().game;
    var reason = null;
    g.on('lose', function (d) { reason = d.reason; });
    g.update(181);
    assert.equal(g.state, 'lose');
    assert.equal(reason, 'time');
    assert.equal(h.play().popup, 'lose');
    h.step(1);
    assert.ok(btn(h.play().popupBtns, 'retry'));

    tapPopup(h, 'shop');
    assert.equal(h.play().popup, 'shop');
    assert.equal(h.play()._shopFrom, 'lose');
    h.step(1);
    tapPopup(h, 'closeShop');
    assert.equal(h.play().popup, 'lose');

    h.step(1);
    tapPopup(h, 'retry');
    assert.equal(h.play().popup, null);
    assert.equal(h.play().game.state, 'playing');

    // 限步关卡：把剩余步数压到 1，下一次配对即耗尽
    h.goto('play', { level: 31 });
    h.step(1);
    var g2 = h.play().game;
    var reason2 = null;
    g2.on('lose', function (d) { reason2 = d.reason; });
    g2.stepsLeft = 1;
    var pair = g2.grid.findAnyPair();
    assert.ok(pair);
    clearPair(g2, pair);
    g2.tapCell(pair[0].r, pair[0].c);
    g2.tapCell(pair[1].r, pair[1].c);
    assert.equal(g2.state, 'lose');
    assert.equal(reason2, 'steps');
    assert.equal(h.play().popup, 'lose');
    h.step(1);
    h.assertNoError();
  });
});

test('移动元素每 10 秒换位并广播 moveswap', function () {
  withHarness({ seed: 42 }, function (h) {
    h.goto('play', { level: 61 });     // 挑战期含 move
    h.step(1);
    var g = h.play().game;
    assert.ok(g.cfg.specials.indexOf('move') >= 0);
    var swaps = [];
    g.on('moveswap', function (d) { swaps.push(d); });
    for (var i = 0; i < 6 && swaps.length === 0; i++) g.update(10.1);
    assert.ok(swaps.length > 0, '累计 10 秒应触发移动块换位');
    assert.notEqual(swaps[0].ia, swaps[0].ib);
    assert.equal(g.moveTimer, 0);
    h.step(1);
    h.assertNoError();
  });
});

test('局内购买有白名单校验且币不足时不扣道具', function () {
  withHarness({ seed: 42 }, function (h) {
    h.goto('play', { level: 1 });
    h.step(1);
    var scene = h.play();
    var Save = harness.core('save');
    var before = Object.assign({}, Save.get('props'));
    var coin = Save.get('coin');

    assert.equal(scene._buyProp('not_a_prop'), false, '白名单外的 key 应被拒绝');
    assert.equal(Save.get('coin'), coin);
    assert.deepEqual(Save.get('props'), before);

    Save.set('coin', 0);
    assert.equal(scene._buyProp('bomb'), false, '余额不足应拒绝');
    assert.deepEqual(Save.get('props'), before);
    h.assertNoError();
  });
});

test('重玩已通关关卡不发喵币也不推进进度', function () {
  withHarness({ seed: 42 }, function (h) {
    var Save = harness.core('save');
    assert.equal(winFast(h, 1), 'win');
    var maxLevel = Save.get('maxLevel'), coin = Save.get('coin');
    assert.equal(maxLevel, 2);

    assert.equal(winFast(h, 1), 'win');
    assert.equal(h.play().replay, true);
    assert.equal(Save.get('maxLevel'), maxLevel);
    assert.equal(Save.get('coin'), coin, '重玩不发喵币');
    h.assertNoError();
  });
});
