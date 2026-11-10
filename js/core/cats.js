/**
 * 养成系统：猫咪实例 / 属性衰减 / 生病判定 / 互动 / 升级
 * 时间以「5 分钟」为最小衰减步长（GDD 5.2）
 */
var CT = require('./catTypes.js');

/** 取词条（延迟 require，避免循环依赖） */
function it(k) {
  try { return require('./i18n.js').t(k); } catch (e) { return k; }
}

var STEP_MS = 5 * 60 * 1000;   // 一个衰减步长
var MAX_STAT = 100;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

/** 新猫咪实例 */
function createCat(typeId, name, homeId) {
  var t = CT.typeById(typeId);
  return {
    id: 'cat_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 9999),
    typeId: typeId,
    name: name || t.name,
    level: 1,
    exp: 0,
    stats: { hunger: 80, cleanliness: 80, happiness: 80 },
    sickness: null,          // 疾病 id 或 null
    sickSince: 0,
    immuneUntil: 0,          // 治疗后 24h 免疫
    isStray: false,
    homeId: homeId || 'home_1',
    lastUpdateTime: Date.now(),
    unlockTime: Date.now()
  };
}

function expNeed(level) { return 50 + (level - 1) * 30; }

/**
 * 属性衰减结算：把「上次结算到现在」的所有步长补算
 * 返回 { steps, gotSick, died:false }
 */
function tick(cat, nowMs, furnitureBonus) {
  if (!cat) return { steps: 0, gotSick: false };
  var now = nowMs || Date.now();
  var last = cat.lastUpdateTime || now;
  var steps = Math.floor((now - last) / STEP_MS);
  if (steps <= 0) return { steps: 0, gotSick: false };
  if (steps > 2000) steps = 2000;   // 离线过久封顶，避免瞬间全 0

  var t = CT.typeById(cat.typeId);
  var fb = furnitureBonus || {};
  var hungerRate = t.hungerRate * (1 + (fb.hungerRate || 0));
  var cleanRate = t.cleanRate * (1 + (fb.cleanRate || 0));
  var happyRate = t.happyRate * (1 + (fb.happyRate || 0));

  // 生病时衰减加速 50%
  var sickMul = cat.sickness ? 1.5 : 1;

  for (var i = 0; i < steps; i++) {
    cat.stats.hunger = clamp(cat.stats.hunger - 3 * hungerRate * sickMul, 0, MAX_STAT);
    cat.stats.cleanliness = clamp(cat.stats.cleanliness - 2 * cleanRate * sickMul, 0, MAX_STAT);
    cat.stats.happiness = clamp(cat.stats.happiness - 1 * happyRate * sickMul, 0, MAX_STAT);

    // 生病判定
    if (!cat.sickness && now >= (cat.immuneUntil || 0)) {
      var p = 0;
      if (cat.stats.hunger < 20 && cat.stats.cleanliness < 30) p += 0.3;
      if (cat.stats.cleanliness < 20 && cat.stats.happiness < 30) p += 0.15;
      if (cat.stats.hunger <= 0 || cat.stats.cleanliness <= 0) p += 0.2;
      if (cat.stats.happiness < 10) p += 0.12;
      p = Math.max(0, p - (t.sicknessResist || 0));
      if (p > 0 && Math.random() < p) {
        cat.sickness = pickSickness(cat);
        cat.sickSince = now;
      }
    }
  }
  cat.lastUpdateTime = cat.lastUpdateTime + steps * STEP_MS;
  return { steps: steps, gotSick: !!cat.sickness };
}

function pickSickness(cat) {
  var s = cat.stats;
  var pool = [];
  if (s.cleanliness < 20) pool.push('skin');
  if (s.hunger < 10) pool.push('stomach');
  if (s.happiness < 10) pool.push('depress');
  if (s.hunger < 20 && s.cleanliness < 30) pool.push('cold');
  if (!pool.length) pool = ['cold', 'skin', 'stomach', 'depress'];
  return pool[ri(0, pool.length - 1)];
}

/** 喂食 / 洗澡 / 玩耍 —— GDD 5.4 */
function feed(cat, item) {
  cat.stats.hunger = clamp(cat.stats.hunger + item.effectValue, 0, MAX_STAT);
  if (item.happy) cat.stats.happiness = clamp(cat.stats.happiness + item.happy, 0, MAX_STAT);
  addExp(cat, 5);
  return it('feedOk');
}

function wash(cat) {
  cat.stats.cleanliness = clamp(cat.stats.cleanliness + 80, 0, MAX_STAT);
  addExp(cat, 8);
  return it('washOk');
}

function play(cat, item) {
  var v = item ? item.effectValue : 20;
  cat.stats.happiness = clamp(cat.stats.happiness + v, 0, MAX_STAT);
  cat.stats.hunger = clamp(cat.stats.hunger - 3, 0, MAX_STAT); // 玩耍消耗体力
  addExp(cat, 6);
  return it('playOk');
}

function addExp(cat, amount) {
  cat.exp += amount;
  var need = expNeed(cat.level);
  while (cat.exp >= need && cat.level < 100) {
    cat.exp -= need;
    cat.level++;
    need = expNeed(cat.level);
  }
  return cat.level;
}

/** 治疗 */
function cure(cat, nowMs) {
  var s = CT.SICKNESS[cat.sickness];
  if (!s) return null;
  cat.sickness = null;
  cat.sickSince = 0;
  cat.immuneUntil = (nowMs || Date.now()) + 24 * 3600 * 1000;
  cat.stats.happiness = clamp(cat.stats.happiness + 20, 0, MAX_STAT);
  return s;
}

/** 状态判定（用于动画/表情） */
function mood(cat) {
  if (!cat) return 'normal';
  if (cat.sickness) return 'sick';
  if (cat.stats.hunger < 25) return 'hungry';
  if (cat.stats.cleanliness < 25) return 'dirty';
  if (cat.stats.happiness < 25) return 'sad';
  if (cat.stats.happiness > 80 && cat.stats.hunger > 60) return 'happy';
  return 'normal';
}

/** 综合评分（0-100），用于猫咪卡片排序与图鉴点亮 */
function score(cat) {
  var s = cat.stats;
  return Math.round((s.hunger + s.cleanliness + s.happiness) / 3);
}

function statColor(v) {
  if (v > 60) return '#6ecf9a';
  if (v > 30) return '#f0c060';
  return '#f06060';
}

module.exports = {
  STEP_MS: STEP_MS,
  createCat: createCat,
  tick: tick,
  feed: feed,
  wash: wash,
  play: play,
  cure: cure,
  mood: mood,
  score: score,
  statColor: statColor,
  expNeed: expNeed,
  addExp: addExp
};
