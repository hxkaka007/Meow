/**
 * 无界面驱动：启动完整的小游戏入口，并逐帧 / 逐触摸地驱动它。
 *
 *   const h = require('./test/harness').boot({ seed: 42 });
 *   h.goto('play', { level: 5 }).closeModals().step(60);
 *   console.log(h.state());   // 机器可读快照
 *   h.assertNoError();
 *   h.finish();
 *
 * 也可直接命令行探测（输出纯 JSON，便于 AI 读取）：
 *   node test/harness.js --scene=play --level=5 --seed=42 --frames=60 --board
 *   node test/harness.js --actions='@test/fixtures/xxx.json'
 */
'use strict';

var path = require('path');
var fs = require('fs');
var envMod = require('./env.js');

var ROOT = path.resolve(__dirname, '..');
var GAME = path.join(ROOT, 'game.js');

function core(name) { return require(path.join(ROOT, 'js', 'core', name + '.js')); }

/** 每次 boot 都重新加载游戏模块，避免 adapter / Save / Game 的模块级单例互相污染 */
function clearGameCache() {
  var prefix = ROOT + path.sep;
  var testDir = path.join(ROOT, 'test') + path.sep;
  Object.keys(require.cache).forEach(function (id) {
    if (id.indexOf(prefix) === 0 && id.indexOf(testDir) !== 0) delete require.cache[id];
  });
}

function boot(opts) {
  opts = opts || {};
  var env = envMod.installEnv(opts);
  clearGameCache();
  if (opts.skipDailyGift !== false) {
    // 预置当日已领奖，避免启动时的两个每日奖励弹窗干扰初始状态
    env.storage.set('catlink_save_v2', { dailyGiftDay: core('save').todayKey() });
  }
  require(GAME);
  var engine = globalThis.__engine;
  if (!engine) {
    env.restore();
    throw new Error('game.js 未暴露 __engine，检查 env 是否完整注入 wx');
  }
  return new Harness(env, engine, opts);
}

function Harness(env, engine, opts) {
  this.env = env;
  this.engine = engine;
  this.opts = opts;
  this.actions = [];
  this.frames = 0;
  this.finished = false;
}

Harness.prototype._rec = function (a) { this.actions.push(a); return this; };

/** 手动推进主循环：时间戳、Date.now()、update(dt)、render() 全部可复现 */
Harness.prototype.step = function (frames, dt) {
  frames = frames == null ? 1 : frames;
  dt = dt == null ? 1 / 60 : dt;
  for (var i = 0; i < frames; i++) {
    this.env.clock.advance(dt * 1000);
    this.env.raf(this.env.clock.now);
  }
  this.frames += frames;
  return this._rec({ type: 'step', frames: frames, dt: dt });
};

/** 走微信触摸回调（而不是直接调逻辑层），因此能覆盖场景点击命中判定 */
Harness.prototype.touch = function (x, y, type) {
  // 按钮命中区是在 render() 里算出来的，真机上用户点击前必然已渲染过至少一帧
  if (this.frames === 0) this.step(1);
  var down = type === 'down';
  var fn = this.env.handlers[down ? 'touchStart' : 'touchEnd'];
  if (!fn) throw new Error('未注册触摸回调: ' + type);
  var pt = { clientX: x, clientY: y };
  fn(down ? { touches: [pt], changedTouches: [pt] } : { touches: [], changedTouches: [pt] });
  return this._rec({ type: down ? 'down' : 'up', x: x, y: y });
};
Harness.prototype.tap = function (x, y) {
  this.touch(x, y, 'down');
  this.touch(x, y, 'up');
  return this;
};

Harness.prototype.goto = function (name, params) {
  this.engine.goto(name, params);
  return this._rec({ type: 'goto', scene: name, params: params || null });
};
Harness.prototype.push = function (name, params) {
  this.engine.push(name, params);
  return this._rec({ type: 'push', scene: name, params: params || null });
};
Harness.prototype.closeModals = function () {
  var n = 0;
  while (this.engine.modal && n < 20) { this.engine.closeModal(); n++; }
  return this._rec({ type: 'closeModals', count: n });
};
Harness.prototype.flushTimers = function () {
  this.env.flushTimers();
  return this._rec({ type: 'flushTimers' });
};

Harness.prototype.play = function () { return this.engine.scenes.play; };

/** 机器可读的全局状态快照 */
Harness.prototype.state = function () {
  var e = this.engine, env = this.env;
  var Save = core('save');
  var p = e.scenes.play;
  var out = {
    scene: e.stack && e.stack.length ? e.stack[e.stack.length - 1] : null,
    stack: (e.stack || []).slice(),
    modal: e.modal ? { title: e.modal.title || '', desc: e.modal.desc || '' } : null,
    error: e._lastError || null,
    consoleErrors: env.errors.slice(),
    missingAssets: e.missingAssets || null,
    frames: this.frames,
    now: env.clock.now,
    tapCount: e.tapCount || 0,
    save: {
      maxLevel: Save.get('maxLevel'),
      coin: Save.get('coin'),
      props: Object.assign({}, Save.get('props'))
    },
    play: null
  };
  if (p && p.game && p.game.cfg) {
    var g = p.game;
    out.play = {
      level: p.level,
      replay: !!p.replay,
      state: g.state,
      score: g.score,
      combo: g.combo,
      timeLeft: Math.round(g.timeLeft * 100) / 100,
      stepsLeft: g.stepsLeft,
      remain: g.grid.remainCount(),
      items: Object.assign({}, g.items),
      popup: p.popup || null
    };
  }
  return out;
};

/** 棋盘快照 + 当前可消除的一对，足够 AI 自己算下一步点击 */
Harness.prototype.board = function () {
  var g = this.engine.scenes.play.game;
  if (!g || !g.grid || !g.grid.rows) return null;
  var rows = [];
  for (var r = 0; r < g.grid.rows; r++) {
    var line = [];
    for (var c = 0; c < g.grid.cols; c++) {
      var cell = g.grid.at(r, c);
      line.push(cell ? {
        img: cell.img, ice: !!cell.ice, chain: !!cell.chain,
        flip: !!cell.flip, revealed: !!cell.revealed,
        move: !!cell.move, bomb: !!cell.bomb
      } : null);
    }
    rows.push(line);
  }
  return { rows: g.grid.rows, cols: g.grid.cols, cells: rows, pair: g.grid.findAnyPair() };
};

Harness.prototype.assertNoError = function () {
  var s = this.state();
  if (s.error || s.consoleErrors.length) {
    throw new Error('无界面运行出现异常:\n' + (s.error || '') + '\n' + s.consoleErrors.join('\n'));
  }
  return this;
};

/** 操作序列回放：失败用例可直接把 exportActions() 存下来复现 */
Harness.prototype.replay = function (actions) {
  var self = this;
  (actions || []).forEach(function (a) {
    switch (a.type) {
      case 'step': self.step(a.frames, a.dt); break;
      case 'goto': self.goto(a.scene, a.params); break;
      case 'push': self.push(a.scene, a.params); break;
      case 'tap': self.tap(a.x, a.y); break;
      case 'down':
      case 'up': self.touch(a.x, a.y, a.type); break;
      case 'closeModals': self.closeModals(); break;
      case 'flushTimers': self.flushTimers(); break;
      default: throw new Error('未知操作类型: ' + a.type);
    }
  });
  return this;
};
Harness.prototype.exportActions = function () {
  return JSON.parse(JSON.stringify(this.actions));
};

Harness.prototype.finish = function () {
  if (this.finished) return;
  this.finished = true;
  clearGameCache();
  this.env.restore();
};

function parseArgs(argv) {
  var out = {};
  argv.forEach(function (a) {
    var m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  });
  return out;
}

if (require.main === module) {
  var a = parseArgs(process.argv.slice(2));
  var h = boot({
    seed: a.seed === undefined ? undefined : Number(a.seed),
    width: a.width === undefined ? undefined : Number(a.width),
    height: a.height === undefined ? undefined : Number(a.height),
    imageFail: !!a.imageFail,
    skipDailyGift: a.skipDailyGift !== undefined ? a.skipDailyGift !== 'false' : true
  });
  var out = {}, fatal = null;
  try {
    if (a.actions) {
      var acts = String(a.actions).charAt(0) === '@'
        ? JSON.parse(fs.readFileSync(path.resolve(ROOT, String(a.actions).slice(1)), 'utf8'))
        : JSON.parse(String(a.actions));
      h.replay(acts);
    }
    if (a.scene) h.goto(String(a.scene), a.level ? { level: Number(a.level) } : undefined);
    h.closeModals();
    if (a.taps) {
      String(a.taps).split(';').forEach(function (pair) {
        var xy = pair.split(',').map(Number);
        h.tap(xy[0], xy[1]);
      });
    }
    // actions 模式由序列完全自描述，不再额外补帧；普通探测默认渲染 1 帧
    if (a.frames !== undefined) h.step(Number(a.frames), a.dt ? Number(a.dt) : undefined);
    else if (!a.actions) h.step(1);
    out = h.state();
    if (a.board) out.board = h.board();
    if (a.logs) out.logs = h.env.logs;
    h.assertNoError();
  } catch (e) {
    fatal = String((e && (e.stack || e.message)) || e);
  }
  out.actions = h.exportActions();
  if (fatal) out.fatal = fatal;
  h.finish();
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exitCode = fatal ? 1 : 0;
}

module.exports = { boot: boot, Harness: Harness, clearGameCache: clearGameCache, core: core, ROOT: ROOT };
