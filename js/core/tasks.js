/**
 * 每日任务（今日任务页数据源）
 *
 * 四条任务与设计稿一致：消除 / 收集 / 挑战 / 炸弹。
 * 进度存在 Save.data.daily，跨天自动重置。
 */
var Save = require('./save.js');

var LIST = [
  { id: 'clear', goal: 30, icon: 'cat1', titleKey: 'taskClear', subKey: 'taskClearSub', reward: 60 },
  { id: 'combo', goal: 6, icon: 'cat2', titleKey: 'taskCombo', subKey: 'taskComboSub', reward: 60 },
  { id: 'level', goal: 1, icon: 'cat3', titleKey: 'taskLevel', subKey: 'taskLevelSub', reward: 80 },
  { id: 'bomb', goal: 1, icon: 'cat4', titleKey: 'taskBomb', subKey: 'taskBombSub', reward: 40 }
];

function today() {
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function blank() {
  return { day: today(), clear: 0, combo: 0, level: 0, bomb: 0, claimed: false };
}

var T = {
  LIST: LIST,

  /** 取当日进度（跨天自动清零） */
  data: function () {
    var d = Save.get('daily');
    if (!d || d.day !== today()) {
      d = blank();
      Save.set('daily', d);
    }
    return d;
  },

  count: function (id) {
    var v = this.data()[id];
    return v || 0;
  },

  /** 累加进度，返回该任务是否"刚好完成" */
  add: function (id, n) {
    var d = this.data();
    var item = null;
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) item = LIST[i];
    if (!item) return false;
    var before = d[id] || 0;
    if (before >= item.goal) return false;
    d[id] = Math.min(item.goal, before + (n === undefined ? 1 : n));
    Save.set('daily', d);
    return before < item.goal && d[id] >= item.goal;
  },

  done: function (id) {
    var d = this.data();
    for (var i = 0; i < LIST.length; i++)
      if (LIST[i].id === id) return (d[id] || 0) >= LIST[i].goal;
    return false;
  },

  allDone: function () {
    for (var i = 0; i < LIST.length; i++)
      if (!this.done(LIST[i].id)) return false;
    return true;
  },

  claimed: function () { return !!this.data().claimed; },

  /** 领取全勤奖励（全部完成后） */
  claim: function () {
    if (this.claimed() || !this.allDone()) return 0;
    var total = 0;
    for (var i = 0; i < LIST.length; i++) total += LIST[i].reward;
    var d = this.data();
    d.claimed = true;
    Save.set('daily', d);
    Save.addCoin(total);
    return total;
  }
};

module.exports = T;
