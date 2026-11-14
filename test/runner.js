/**
 * 声明式用例执行器：把 test/cases/*.yaml 的「步骤 + 期望」翻译成 harness 调用与断言。
 *
 * 三条原则：
 *  1. 用例是纯数据 —— YAML 带注释，写中文业务词；
 *  2. 别名不写死 —— 中文词到内部标识的映射全在 _fields.yaml；
 *  3. 扩展不改主流程 —— 动作和断言都是注册表，新增一项即可，不动 runCase()。
 *
 * 依赖：js-yaml（见 package.json）。
 */
'use strict';

var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var yaml = require('js-yaml');
var harness = require('./harness.js');

var CASES_DIR = path.join(__dirname, 'cases');
var DICT = yaml.load(fs.readFileSync(path.join(CASES_DIR, '_fields.yaml'), 'utf8')) || {};
var FIELD = DICT['字段'] || {};
var BOOT = DICT['启动'] || {};
var SAVE_FIELD = DICT['存档字段'] || {};
var ENUM = DICT['枚举'] || {};
var BUTTON = DICT['按钮'] || {};
var MODE = DICT['模式'] || {};
var SCENE = DICT['场景'] || {};
var VALUE_DICTS = [ENUM, SCENE, BUTTON, MODE];

function has(map, k) { return Object.prototype.hasOwnProperty.call(map, String(k)); }
function alias(map, v) { return v != null && has(map, v) ? map[String(v)] : v; }
function resolveValue(v) {
  for (var i = 0; i < VALUE_DICTS.length; i++) {
    if (v != null && has(VALUE_DICTS[i], v)) return VALUE_DICTS[i][String(v)];
  }
  return v;
}
function bool(v) {
  if (v === '是' || v === true || v === 'true') return true;
  if (v === '否' || v === false || v === 'false') return false;
  return v;
}
function num(v) {
  if (typeof v === 'number') return v;
  var m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}
function get(obj, dotPath) {
  return String(dotPath).split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
}
/** 字段路径是否真实存在于快照里（允许值为 null / undefined，但路径必须存在） */
function pathExists(obj, dotPath) {
  var keys = String(dotPath).split('.'), cur = obj;
  for (var i = 0; i < keys.length; i++) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(cur, keys[i])) return false;
    cur = cur[keys[i]];
  }
  return true;
}

function tapRect(h, b) { h.tap(b.x + b.w / 2, b.y + b.h / 2); }
function tapKey(h, list, key) {
  for (var i = 0; i < (list || []).length; i++) {
    if (list[i] && list[i].key === key) { tapRect(h, list[i]); return; }
  }
  throw new Error('未找到按钮「' + key + '」');
}
function findPair(g) {
  var p = g.grid.findAnyPair();
  if (!p) { g._checkDead(); p = g.grid.findAnyPair(); }
  return p;
}
function clearPair(g, pair) {
  pair.forEach(function (p) {
    var c = g.grid.at(p.r, p.c);
    if (c) { c.ice = false; c.flip = false; c.revealed = true; c.chain = false; }
  });
}
function matchPair(h, mode) {
  var scene = h.play(), g = scene.game;
  var pair = findPair(g);
  if (!pair) return false;
  clearPair(g, pair);
  var a = pair[0], b = pair[1];
  if (mode === 'logic') { g.tapCell(a.r, a.c); g.tapCell(b.r, b.c); }
  else {
    h.tap(scene._cx(a.c), scene._cy(a.r));
    h.tap(scene._cx(b.c), scene._cy(b.r));
  }
  h.step(1);
  return true;
}
function autoPlay(h, mode) {
  var scene = h.play(), g = scene.game;
  var useTouch = mode !== 'logic', guard = 0;
  while (g.state === 'playing' && guard++ < 300) {
    var pair = findPair(g);
    if (!pair) break;
    var a = pair[0], b = pair[1];
    if (mode === 'specials') {
      [a, b].forEach(function (p) {
        for (var k = 0; k < 3; k++) {
          var c = g.grid.at(p.r, p.c);
          if (!c) return;
          if (!c.ice && !(c.flip && !c.revealed)) return;
          h.tap(scene._cx(p.c), scene._cy(p.r));
        }
      });
      if (!g.grid.connect(a.r, a.c, b.r, b.c)) continue;
    } else {
      clearPair(g, pair);
    }
    if (useTouch) {
      h.tap(scene._cx(a.c), scene._cy(a.r));
      h.tap(scene._cx(b.c), scene._cy(b.r));
    } else {
      g.tapCell(a.r, a.c); g.tapCell(b.r, b.c);
    }
    h.step(1);
  }
  return guard;
}

/* ---------------- 动作注册表：新增动作只加一个 def() ---------------- */
var ACTIONS = Object.create(null);
function def(name, fn) { ACTIONS[name] = fn; }

def('推进', function (h, v) {
  var n = num(v);
  h.step(n === undefined ? 1 : n);
});
def('进入', function (h, v) { h.goto(alias(SCENE, v)); });
def('压入', function (h, v) { h.push(alias(SCENE, v)); });
def('点击', function (h, v) {
  var a = Array.isArray(v) ? v : [v.x, v.y];
  h.tap(num(a[0]), num(a[1]));
});
def('点击格子', function (h, v) {
  var a = Array.isArray(v) ? v : [v.r, v.c];
  var s = h.play();
  h.tap(s._cx(num(a[1])), s._cy(num(a[0])));
});
def('点击道具', function (h, v) { tapKey(h, h.play().itemBtns, alias(BUTTON, v)); });
def('点击弹窗按钮', function (h, v) { tapKey(h, h.play().popupBtns, alias(BUTTON, v)); });
def('点击顶栏', function (h, v) {
  var k = alias(BUTTON, v);
  tapRect(h, h.play()[k === 'pause' ? 'pauseBtn' : 'backBtn']);
});
def('消除一对', function (h, v) { matchPair(h, alias(MODE, v) || 'touch'); });
def('自动通关', function (h, v) { autoPlay(h, alias(MODE, v) || 'touch'); });
def('使用道具', function (h, v) { h.play().game.useItem(alias(BUTTON, v)); });
def('设置存档', function (h, v) {
  var S = harness.core('save');
  Object.keys(v || {}).forEach(function (k) { S.set(alias(SAVE_FIELD, k), bool(v[k])); });
});
def('设置日期', function (h, v) { h.env.clock.set(Date.parse(String(v))); });
def('关闭弹窗', function (h) { h.closeModals(); });
def('执行定时器', function (h) { h.flushTimers(); });

/* ---------------- 断言操作符注册表：新增比较只加一个 matcher() ---------------- */
var MATCHERS = [];
function matcher(re, fn) { MATCHERS.push({ re: re, fn: fn }); }
function msg(label, actual, expr) {
  return label + ' 期望「' + expr + '」，实际 ' + JSON.stringify(actual);
}

matcher(/^>\s*(-?[\d.]+)$/, function (a, m, b, label, expr) {
  assert.ok(a > Number(m[1]), msg(label, a, expr));
});
matcher(/^>=\s*(-?[\d.]+)$/, function (a, m, b, label, expr) {
  assert.ok(a >= Number(m[1]), msg(label, a, expr));
});
matcher(/^<\s*(-?[\d.]+)$/, function (a, m, b, label, expr) {
  assert.ok(a < Number(m[1]), msg(label, a, expr));
});
matcher(/^<=\s*(-?[\d.]+)$/, function (a, m, b, label, expr) {
  assert.ok(a <= Number(m[1]), msg(label, a, expr));
});
matcher(/^初始\s*([+-])\s*([\d.]+)$/, function (a, m, b, label, expr) {
  var want = Number(b) + (m[1] === '-' ? -1 : 1) * Number(m[2]);
  assert.equal(a, want, msg(label, a, expr + '（初始 ' + JSON.stringify(b) + '）'));
});
matcher(/^增加$/, function (a, m, b, label, expr) {
  assert.ok(a > b, msg(label, a, expr + '（初始 ' + JSON.stringify(b) + '）'));
});
matcher(/^减少$/, function (a, m, b, label, expr) {
  assert.ok(a < b, msg(label, a, expr + '（初始 ' + JSON.stringify(b) + '）'));
});
matcher(/^不变$/, function (a, m, b, label, expr) {
  assert.deepEqual(a, b, msg(label, a, expr));
});
matcher(/^非空$/, function (a, m, b, label, expr) {
  assert.ok(a !== null && a !== undefined && a !== '', msg(label, a, expr));
});
matcher(/^为空$/, function (a, m, b, label, expr) {
  assert.ok(a === null || a === undefined || a === '', msg(label, a, expr));
});
matcher(/^包含\s+(.+)$/, function (a, m, b, label, expr) {
  assert.ok(a != null && a.indexOf(m[1]) >= 0, msg(label, a, expr));
});

function verify(actual, expected, label, before) {
  if (typeof expected === 'string') {
    for (var i = 0; i < MATCHERS.length; i++) {
      var m = MATCHERS[i].re.exec(expected);
      if (m) { MATCHERS[i].fn(actual, m, before, label, expected); return; }
    }
  }
  assert.deepEqual(actual, expected, label + ' 不匹配');
}

function bootOpts(defaults, custom) {
  var opts = {};
  [defaults || {}, custom || {}].forEach(function (src) {
    Object.keys(src).forEach(function (k) { opts[alias(BOOT, k)] = bool(src[k]); });
  });
  if (typeof opts.now === 'string') opts.now = Date.parse(opts.now);
  return opts;
}

function runCase(def, defaults) {
  var h = harness.boot(bootOpts(defaults, def['启动参数']));
  try {
    if (def['进入']) {
      h.goto(alias(SCENE, def['进入']), def['关卡'] === undefined ? undefined : { level: def['关卡'] });
      h.closeModals();
      h.step(1);
    }
    var before = h.state();
    (def['步骤'] || []).forEach(function (step) {
      var name = Object.keys(step || {})[0];
      var fn = ACTIONS[name];
      if (!fn) throw new Error('未知步骤「' + name + '」，可用动作：' + Object.keys(ACTIONS).join('、'));
      fn(h, step[name]);
    });
    var after = h.state();
    var caseName = def['名称'] || '未命名用例';
    Object.keys(def['期望'] || {}).forEach(function (label) {
      if (!has(FIELD, label)) {
        throw new Error('用例「' + caseName + '」的期望字段「' + label + '」未在 _fields.yaml 的「字段」表登记');
      }
      var dot = FIELD[String(label)];
      if (!pathExists(before, dot) || !pathExists(after, dot)) {
        throw new Error('用例「' + caseName + '」的字段「' + label + '」(' + dot + ') 在 state() 快照中不存在，检查字典或 state() 结构');
      }
      var expected = resolveValue(def['期望'][label]);
      verify(get(after, dot), expected, label + '(' + dot + ')', get(before, dot));
    });
    if (def['无异常'] !== false) h.assertNoError();
    return after;
  } finally {
    h.finish();
  }
}

module.exports = {
  runCase: runCase,
  ACTIONS: ACTIONS,
  MATCHERS: MATCHERS,
  DICT: DICT,
  pathExists: pathExists,
  caseFiles: function () {
    return fs.readdirSync(CASES_DIR)
      .filter(function (f) { return /\.ya?ml$/.test(f) && f.charAt(0) !== '_'; })
      .sort();
  }
};
