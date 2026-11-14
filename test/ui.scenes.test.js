/**
 * 场景交互矩阵：把每个场景 render() 生成的所有命中区逐个点击一遍，
 * 再对选关 / 商城 / 设置面板 / 底部导航做定向断言。
 */
'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var harness = require('./harness.js');

function withHarness(opts, fn) {
  var h = harness.boot(opts);
  try { return fn(h); } finally { h.finish(); }
}

/** 绕过 goto 的 home/home2 风格路由，直接把指定场景置为当前场景并渲染一帧 */
function enter(h, name) {
  var s = h.engine.scenes[name];
  h.engine.current = s;
  h.engine.stack = [name];
  if (s.onShow) s.onShow();
  h.closeModals();
  h.step(1);
  return s;
}

function collect(h) {
  var scene = h.engine.current, out = [];
  function visit(v, label) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.forEach(function (item, i) { visit(item, label + '[' + i + ']'); });
      return;
    }
    if (typeof v.x === 'number' && typeof v.y === 'number' &&
        typeof v.w === 'number' && typeof v.h === 'number') {
      out.push({ label: label, key: v.key, x: v.x, y: v.y, w: v.w, h: v.h });
    }
    if (v.box && v.box !== v) visit(v.box, label + '.box');
  }
  Object.keys(scene).forEach(function (k) { visit(scene[k], k); });
  return out;
}
function find(scene, key) {
  var list = collect({ engine: { current: scene } });
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  throw new Error('未找到命中区: ' + key);
}
function tapRect(h, b) { h.tap(b.x + b.w / 2, b.y + b.h / 2); }

test('9 个场景的所有命中区逐个点击都不产生脚本异常', function () {
  withHarness({ seed: 42 }, function (h) {
    harness.core('save').buyCat('ju');   // catroom / hospital 需要有猫
    var names = ['home', 'home2', 'cats', 'select', 'shop', 'hospital', 'bag', 'task', 'play'];
    var total = 0;
    names.forEach(function (name) {
      enter(h, name);
      var buttons = collect(h);
      assert.ok(buttons.length > 0, name + ' 应有可点击区域');
      buttons.forEach(function (b) {
        h.env.errors.length = 0;
        h.engine._lastError = null;
        enter(h, name);
        tapRect(h, b);
        h.step(1);
        var s = h.state();
        assert.equal(s.error, null, name + ' / ' + b.label + ' 出现脚本错误');
        assert.equal(s.consoleErrors.length, 0, name + ' / ' + b.label + ' 出现 console.error');
        total++;
      });
    });
    assert.ok(total > 30, '应覆盖足够多的命中区，实际 ' + total);
  });
});

test('选关页：已解锁关卡进入对局，锁定关卡不可进入，继续闯关直达当前进度', function () {
  withHarness({ seed: 42 }, function (h) {
    var Save = harness.core('save');
    enter(h, 'select');
    var unlocked = null, locked = null;
    h.engine.scenes.select.levelBtns.forEach(function (b) {
      if (!b.locked && !unlocked) unlocked = b;
      if (b.locked && !locked) locked = b;
    });
    assert.ok(unlocked && locked);

    tapRect(h, unlocked);
    assert.equal(h.state().scene, 'play');
    assert.equal(h.play().level, unlocked.level);

    enter(h, 'select');
    tapRect(h, locked);
    assert.equal(h.state().scene, 'select', '锁定关卡不可点进');

    tapRect(h, find(h.engine.scenes.select, 'continue'));
    assert.equal(h.state().scene, 'play');
    assert.equal(h.play().level, Save.get('maxLevel'));
    h.assertNoError();
  });
});

test('商城购买道具与底部导航跳转', function () {
  withHarness({ seed: 42 }, function (h) {
    var Save = harness.core('save');
    var scene = enter(h, 'shop');
    tapRect(h, find(scene, 'prop'));       // 切到「道具」分类
    h.step(1);
    assert.equal(scene.cat, 'prop');
    var coin0 = Save.get('coin'), hint0 = Save.get('props').hint;
    var buy = find(scene, 'buy_prop_hint');
    assert.ok(buy);
    tapRect(h, buy);
    assert.equal(Save.get('coin'), coin0 - 50);
    assert.equal(Save.get('props').hint, hint0 + 1);

    enter(h, 'shop');
    var nav = find(h.engine.scenes.shop, 'bag');
    tapRect(h, nav);
    assert.equal(h.state().scene, 'bag');
    h.assertNoError();
  });
});

test('主页设置面板可切换语言与音乐开关', function () {
  withHarness({ seed: 42 }, function (h) {
    var Save = harness.core('save');
    var scene = enter(h, 'home');
    scene.settingsOpen = true;       // 打开面板的点击已由上面的通用矩阵覆盖
    h.step(1);
    assert.equal(scene.settingsOpen, true);
    var en = find(scene, 'lang_en');
    tapRect(h, en);
    assert.equal(Save.get('lang'), 'en');

    var music0 = Save.get('music');
    tapRect(h, find(scene, 'music'));
    assert.notEqual(Save.get('music'), music0);
    h.step(1);
    h.assertNoError();
  });
});

test('猫窝用高级食物喂食会正确扣库存并提升饱食度', function () {
  withHarness({ seed: 42 }, function (h) {
    var Save = harness.core('save');
    Save.buyCat('ju');
    var inv = Save.get('inventory');
    inv.food_can = 0;
    inv.food_milk = 1;          // 商城里「猫布丁」的真实 itemId
    Save.set('inventory', inv);
    var scene = enter(h, 'cats');
    var feed = find(scene, 'feed');
    assert.ok(feed);
    var hunger0 = Save.get('cats')[0].stats.hunger;
    tapRect(h, feed);
    assert.ok(Save.get('cats')[0].stats.hunger > hunger0, '喂食应提升饱食度');
    assert.equal(Save.get('inventory').food_milk, 0, '高级食物应扣 1');
    h.step(1);
    h.assertNoError();
  });
});
