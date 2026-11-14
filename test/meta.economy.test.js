/**
 * 每日奖励 / 跨天 / 每日任务 / 猫咪养成 / 存档经济 / 医院治疗。
 * 时间通过 env.clock.set() 推进，不依赖真实墙钟。
 */
'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var harness = require('./harness.js');

function withHarness(opts, fn) {
  var h = harness.boot(opts);
  try { return fn(h); } finally { h.finish(); }
}
function day(h, iso) { h.env.clock.set(Date.parse(iso)); }

test('首次启动排队两个每日奖励弹窗，关闭后奖励已入账', function () {
  withHarness({ seed: 42, skipDailyGift: false }, function (h) {
    h.step(1);
    var Save = harness.core('save');
    assert.ok(h.state().modal, '应有喵币弹窗');
    assert.equal(h.engine._modalQueue.length, 1, '道具弹窗应排在队列里');
    assert.equal(h.engine.modal.items.length, 0, '第一个弹窗只发喵币');
    assert.equal(Save.get('coin'), 300 + 100 + Math.min(200, 1 * 4));
    assert.equal(Save.get('props').hint, 2, '默认 1 + 每日赠礼 1');
    assert.equal(h.env.storage.get('catlink_save_v2').dailyGiftDay, Save.todayKey());

    h.closeModals();
    assert.equal(h.state().modal, null, '两个弹窗都要关闭才清空');
    h.step(1);
    h.assertNoError();
  });
});

test('每日奖励同日判重、跨天补发，onShow 回调也受同一判重保护', function () {
  withHarness({ seed: 42, skipDailyGift: false }, function (h) {
    var Save = harness.core('save');
    h.closeModals();
    day(h, '2026-01-01T12:00:00+08:00');
    assert.equal(Save.claimDailyRewards(), null, '同一天不可重复领取');
    h.env.handlers.onShow();
    assert.equal(h.state().modal, null, '同日回到前台不应再弹窗');

    day(h, '2026-01-02T12:00:00+08:00');
    var r = Save.claimDailyRewards();
    assert.ok(r && r.coin > 0);
    assert.equal(Save.claimDailyRewards(), null);

    day(h, '2026-01-03T12:00:00+08:00');
    h.env.handlers.onShow();
    assert.ok(h.state().modal, '跨天回到前台应补发');
    assert.equal(h.engine._modalQueue.length, 1);
    assert.equal(Save.get('adCount'), 0, '跨天重置广告次数');
    assert.equal(Save.get('shareCount'), 0);
    h.closeModals();
    h.assertNoError();
  });
});

test('每日任务完成、领取幂等、跨天重置，与登录礼互不干扰', function () {
  withHarness({ seed: 42 }, function (h) {
    var T = harness.core('tasks'), Save = harness.core('save');
    var giftDay = Save.get('dailyGiftDay');
    T.add('clear', 30);
    T.add('combo', 6);
    T.add('level', 1);
    T.add('bomb', 1);
    assert.equal(T.allDone(), true);
    assert.equal(T.claimed(), false);

    var coin = Save.get('coin');
    assert.equal(T.claim(), 240, '四项任务总奖励 60+60+80+40');
    assert.equal(Save.get('coin'), coin + 240);
    assert.equal(T.claim(), 0, '领取幂等');
    assert.equal(Save.get('dailyGiftDay'), giftDay, '任务领取不影响登录礼判重');

    day(h, '2026-01-02T12:00:00+08:00');
    var d = T.data();
    assert.equal(d.clear, 0);
    assert.equal(d.claimed, false, '跨天重置领取标记');
    assert.equal(T.claimed(), false);
    assert.ok(Save.claimDailyRewards(), '跨天登录礼仍可领');
    assert.equal(T.claimed(), false, '登录礼不影响任务判重');
    h.assertNoError();
  });
});

test('猫咪创建、时间衰减、2000 步封顶、喂养与治疗免疫', function () {
  withHarness({ seed: 42 }, function (h) {
    var Cats = harness.core('cats');
    var CT = harness.core('catTypes');
    var Shop = harness.core('shop');
    var cat = Cats.createCat('ju', '测试猫', 'home_1');
    assert.equal(cat.stats.hunger, 80);
    assert.equal(cat.sickness, null);
    assert.equal(cat.level, 1);
    cat.immuneUntil = Number.MAX_SAFE_INTEGER;   // 隔离随机生病，专注衰减断言

    assert.deepEqual(Cats.tick(cat, cat.lastUpdateTime, {}), { steps: 0, gotSick: false });
    var t0 = cat.lastUpdateTime;
    var r1 = Cats.tick(cat, t0 + 10 * Cats.STEP_MS, {});
    assert.equal(r1.steps, 10);
    assert.ok(cat.stats.hunger < 80, '饱食度应衰减');
    assert.ok(cat.stats.cleanliness < 80);
    assert.ok(cat.stats.happiness < 80);

    var r2 = Cats.tick(cat, cat.lastUpdateTime + 5000 * Cats.STEP_MS, {});
    assert.equal(r2.steps, 2000, '衰减步数上限 2000');

    var before = cat.stats.hunger;
    Cats.feed(cat, Shop.byId('food_basic'));
    assert.ok(cat.stats.hunger > before, '喂食应提升饱食度');
    Cats.wash(cat);
    assert.ok(cat.stats.cleanliness > 0);
    Cats.play(cat, Shop.byId('toy_mint'));
    assert.equal(Cats.addExp(cat, 50), 2, '1 级升 2 级需要 50 经验');
    assert.ok(Cats.mood(cat));
    assert.ok(Cats.score(cat) >= 0 && Cats.score(cat) <= 100);

    var sickness = Object.keys(CT.SICKNESS)[0];
    cat.sickness = sickness;
    assert.ok(Cats.cure(cat, 1000), '有效病种应可治愈');
    assert.equal(cat.sickness, null);
    assert.equal(cat.immuneUntil, 1000 + 24 * 3600 * 1000, '治愈后 24 小时免疫');
    assert.equal(Cats.cure(cat, 2000), null, '未生病时治愈返回 null');
    h.assertNoError();
  });
});

test('存档经济：喵币、广告/分享上限、家具加成、多窝与领养', function () {
  withHarness({ seed: 42 }, function (h) {
    var Save = harness.core('save');
    assert.equal(Save.get('coin'), 300);
    assert.equal(Save.addCoin(100), 400);
    assert.equal(Save.spendCoin(1e9), false);
    assert.equal(Save.get('coin'), 400);

    for (var i = 0; i < 5; i++) assert.equal(Save.rewardAd(), 200);
    assert.equal(Save.rewardAd(), 0, '广告奖励每日上限 5 次');
    for (var j = 0; j < 3; j++) assert.equal(Save.rewardShare(), 50);
    assert.equal(Save.rewardShare(), 0, '分享奖励每日上限 3 次');

    assert.equal(Save.claimActivityCat(), 'sanhua');
    assert.equal(Save.claimActivityCat(), null);
    assert.equal(Save.addHome('第二个窝'), 'home_2');
    assert.equal(Save.get('homes').length, 2);

    var coinBeforeCat = Save.get('coin');
    var cat = Save.buyCat('ju');
    assert.equal(Save.get('cats').length, 1);
    assert.equal(Save.catsInHome('home_1').length, 1);
    assert.equal(Save.get('coin'), coinBeforeCat, 'buyCat 本身不扣币');

    Save.set('furniture', ['fur_bed']);
    assert.deepEqual(Save.furnitureBonus(), { hungerRate: 0, cleanRate: -0.1, happyRate: 0 });
    assert.deepEqual(Save.tickAll(), [], '时间未推进时不应新染病');
    assert.ok(cat.id);
    h.assertNoError();
  });
});

test('医院治疗按钮会扣币并治愈病猫', function () {
  withHarness({ seed: 42 }, function (h) {
    var Save = harness.core('save');
    var CT = harness.core('catTypes');
    var cat = Save.buyCat('ju');
    cat.sickness = Object.keys(CT.SICKNESS)[0];
    cat.sickSince = h.env.clock.now;
    Save.save();
    var coin0 = Save.get('coin');

    h.goto('hospital');
    h.step(1);
    var list = h.engine.scenes.hospital.cureBtns || [];
    assert.equal(list.length, 1, '病猫应出现治疗按钮');
    h.tap(list[0].x + list[0].w / 2, list[0].y + list[0].h / 2);
    assert.equal(Save.get('cats')[0].sickness, null);
    assert.ok(Save.get('coin') < coin0, '治疗应扣喵币');
    h.step(1);
    h.assertNoError();
  });
});
