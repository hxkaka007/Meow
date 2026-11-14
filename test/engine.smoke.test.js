/**
 * 引擎级无界面冒烟：原样 require 根目录 game.js，在假 wx 环境里跑完整主循环。
 * 覆盖 启动 -> 全场景渲染 -> 触摸分发 -> 逻辑/场景/渲染联动 -> 失败可复现。
 */
'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var harness = require('./harness.js');

function withHarness(opts, fn) {
  var h = harness.boot(opts);
  try { return fn(h); } finally { h.finish(); }
}

test('小游戏入口可在纯 Node 无界面启动并逐帧推进', function () {
  withHarness({}, function (h) {
    var s = h.state();
    assert.equal(s.scene, 'home');
    assert.equal(s.modal, null, '预置存档后不应有每日奖励弹窗');
    assert.equal(s.error, null);
    assert.deepEqual(s.missingAssets, []);
    h.step(60);
    assert.equal(h.state().frames, 60);
    h.assertNoError();
  });
});

test('全部 9 个场景都能渲染且不产生脚本错误', function () {
  withHarness({}, function (h) {
    var scenes = ['home', 'select', 'shop', 'hospital', 'bag', 'task', 'cats', 'play'];
    scenes.forEach(function (name) {
      h.goto(name, name === 'play' ? { level: 1 } : undefined);
      h.closeModals();
      h.step(5);
      h.assertNoError();
      assert.equal(h.state().scene, name);
    });
    // goto('home2') 会按存档风格路由，用 push 直接测温馨小屋场景本体
    h.push('home2');
    h.closeModals();
    h.step(5);
    h.assertNoError();
    assert.equal(h.state().scene, 'home2');
  });
});

test('触摸事件能穿透 wx 回调进入场景交互', function () {
  withHarness({}, function (h) {
    h.step(1);
    h.tap(180, 400);   // 命中区随布局变化，这里只断言输入链路通畅
    h.step(10);
    assert.equal(h.state().tapCount, 1);
    h.assertNoError();
  });
});

test('消除一对方块会同时驱动逻辑状态、场景动画与渲染', function () {
  withHarness({ seed: 42 }, function (h) {
    h.goto('play', { level: 1 });
    var g = h.play().game;
    var pair = g.grid.findAnyPair();
    assert.ok(pair, '开局必须有可消除的一对');
    // 清掉冰/翻面，让这一对必定走「选中 -> 配对」而不是破冰/翻牌
    pair.forEach(function (p) {
      var c = g.grid.at(p.r, p.c);
      c.ice = false; c.flip = false; c.revealed = true;
    });
    var before = h.state().play;
    assert.equal(g.tapCell(pair[0].r, pair[0].c), true);
    assert.equal(g.tapCell(pair[1].r, pair[1].c), true);
    h.step(30);
    var after = h.state().play;
    assert.equal(after.remain, before.remain - 2);
    assert.ok(after.score > before.score);
    assert.equal(after.state, 'playing');
    h.assertNoError();
  });
});

test('固定 seed 生成完全相同的棋盘（失败可复现）', function () {
  var a = withHarness({ seed: 777 }, function (h) {
    h.goto('play', { level: 20 });
    return JSON.stringify(h.board().cells);
  });
  var b = withHarness({ seed: 777 }, function (h) {
    h.goto('play', { level: 20 });
    return JSON.stringify(h.board().cells);
  });
  assert.equal(a, b);
  assert.equal(JSON.parse(a).length, 6);
});

test('同一操作序列回放得到完全一致的状态', function () {
  var actions = [
    { type: 'goto', scene: 'play', params: { level: 5 } },
    { type: 'step', frames: 20 },
    { type: 'tap', x: 180, y: 400 },
    { type: 'step', frames: 10 }
  ];
  var a = withHarness({ seed: 99 }, function (h) { h.replay(actions); return h.state(); });
  var b = withHarness({ seed: 99 }, function (h) { h.replay(actions); return h.state(); });
  assert.deepEqual(a, b);
  assert.equal(a.frames, 30, '20 + 10 帧应全部被回放');
});

test('所有图片加载失败时兜底渲染仍不崩溃', function () {
  withHarness({ imageFail: true }, function (h) {
    h.step(60);
    var s = h.state();
    assert.ok(s.missingAssets.length > 0, '应能报告缺失资源清单');
    assert.equal(s.error, null);
    h.assertNoError();
  });
});

test('图片失败重试按虚拟时钟执行，资源恢复后写回图片缓存', function () {
  withHarness({ imageFail: true }, function (h) {
    var e = h.engine;
    function loaded() {
      return Object.keys(e._imgs || {}).filter(function (k) { return !!e._imgs[k]; }).length;
    }
    assert.ok(h.state().missingAssets.length > 0, '启动期应报告缺失资源');
    var queued = h.env.timers.length;
    assert.ok(queued > 0, '每张失败的图都应排队一次重试');
    assert.equal(loaded(), 0, '启动时图片缓存应为空');

    h.env.imageFail = false;   // 模拟加载恢复
    h.step(30);                // 虚拟时间推进 0.5s，触发 400ms 那批重试
    assert.ok(loaded() > 0, '重试成功后应把图片写回缓存');
    assert.ok(h.env.timers.length < queued, '到期定时器应被执行并移出队列');
    h.assertNoError();
  });
});
