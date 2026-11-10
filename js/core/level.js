/**
 * 无限关卡配置生成器
 * 棋盘统一 6x6（36 格 / 18 对）：单局更短、单位格子的倒计时更宽裕，节奏更舒缓。
 * 难度曲线改由「图案种类 / 特殊元素 / 时间与步数限制」递进：
 *  1-10   新手期  8~16 种图案  无特殊元素        180秒
 *  11-30  成长期  16~22 种     冰块              150秒
 *  31-60  进阶期  20~26 种     冰块+锁链+翻转    步数限制
 *  61-100 挑战期  24~32 种     全元素            时间+步数双限
 *  100+   无尽期  26~34 种     随机组合          动态难度
 */
var SPRITES = require('./sprites.js');
var IMG_COUNT = SPRITES.tileCount; // 图库总数 = cats 24 帧 + icons 24 帧（48，同一局内每种图案唯一）
var KINDS = [];     // 图片 id 列表 1..IMG_COUNT
for (var i = 1; i <= IMG_COUNT; i++) KINDS.push(i);

function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr, n) {
  var c = arr.slice();
  for (var i = c.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = c[i]; c[i] = c[j]; c[j] = t;
  }
  return c.slice(0, n);
}

function levelConfig(id) {
  var cfg = { id: id };
  var grid = [6, 6];   // 全局固定 6x6，不再随关卡放大棋盘
  var kinds, specials = [], timeLimit = 0, stepLimit = 0;

  if (id <= 10) { // 新手期
    kinds = id <= 3 ? ri(8, 10) : ri(12, 16);
    timeLimit = 180;
  } else if (id <= 30) { // 成长期
    kinds = ri(16, 22);
    specials = ['ice'];
    timeLimit = 150;
  } else if (id <= 60) { // 进阶期
    kinds = ri(20, 26);
    specials = ['ice', 'chain'];
    if (id > 45) specials.push('flip');
  } else if (id <= 100) { // 挑战期
    kinds = ri(24, 32);
    specials = ['ice', 'chain', 'flip', 'move'];
  } else { // 无尽期：动态难度
    kinds = ri(26, 34);
    var pool = ['ice', 'chain', 'flip', 'move', 'bomb'];
    specials = pick(pool, ri(2, Math.min(5, 2 + Math.floor((id - 100) / 25))));
    // 动态时间：基础随关卡缓慢收紧
    timeLimit = Math.max(120, 210 - Math.floor((id - 100) / 5) * 3);
  }

  // 偶数格校正（保证可以成对）
  var total = grid[0] * grid[1];
  if (total % 2 !== 0) grid[1] += 1;
  total = grid[0] * grid[1];

  if (id > 60 && id <= 100) {
    // 挑战期：时间与步数双限
    timeLimit = 210;
    stepLimit = Math.ceil(total / 2 * 1.35);
  } else if (id > 30 && id <= 60) {
    // 进阶期：步数限制为主
    timeLimit = 0;
    stepLimit = Math.ceil(total / 2 * 1.3);
  }

  // 炸弹块概率（无尽期）
  if (specials.indexOf('bomb') >= 0) cfg.bombChance = 0.15;

  cfg.grid = grid;
  cfg.kinds = Math.min(kinds, IMG_COUNT);
  cfg.specials = specials;
  cfg.timeLimit = timeLimit;   // 0 表示不限时
  cfg.stepLimit = stepLimit;   // 0 表示不限步数
  cfg.items = { hint: 1, shuffle: 1, bomb: 1, time: 1 }; // 每关赠送
  return cfg;
}

/** 阶段名（用于关卡界面显示） */
var STAGE_ZH = ['新手期', '成长期', '进阶期', '挑战期', '无尽期'];
var STAGE_EN = ['Rookie', 'Growing', 'Advanced', 'Challenge', 'Endless'];
function stageName(id) {
  var i = id <= 10 ? 0 : id <= 30 ? 1 : id <= 60 ? 2 : id <= 100 ? 3 : 4;
  var en = false;
  try { en = require('./i18n.js').lang() === 'en'; } catch (e) { }
  return en ? STAGE_EN[i] : STAGE_ZH[i];
}

module.exports = { levelConfig: levelConfig, stageName: stageName, KINDS: KINDS, IMG_COUNT: IMG_COUNT };
