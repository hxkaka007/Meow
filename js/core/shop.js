/**
 * 商品表（shop_items）——GDD 第七/八章
 */
var SHOP_ITEMS = [
  // 食物
  { itemId: 'food_basic', name: '小鱼干', category: 'food', price: 30, effectType: 'hunger', effectValue: 20, desc: '饱食度 +20', icon: 'food_fish', name_en: 'Dried fish', desc_en: 'Hunger +20' },
  { itemId: 'food_can', name: '猫罐头', category: 'food', price: 80, effectType: 'hunger', effectValue: 50, desc: '饱食度 +50', icon: 'food_can', name_en: 'Cat can', desc_en: 'Hunger +50' },
  { itemId: 'food_milk', name: '猫布丁', category: 'food', price: 45, effectType: 'hunger', effectValue: 30, desc: '饱食度 +30，心情 +5', icon: 'food_pudding', happy: 5, name_en: 'Pudding', desc_en: 'Hunger +30, Mood +5' },
  // 玩具
  { itemId: 'toy_mint', name: '猫薄荷', category: 'toy', price: 50, effectType: 'happy', effectValue: 15, desc: '心情 +15', icon: 'toy_mint', name_en: 'Catnip', desc_en: 'Mood +15' },
  { itemId: 'toy_wand', name: '逗猫棒', category: 'toy', price: 100, effectType: 'happy', effectValue: 30, desc: '心情 +30', icon: 'toy_wand', name_en: 'Teaser wand', desc_en: 'Mood +30' },
  { itemId: 'toy_ball', name: '毛线球', category: 'toy', price: 150, effectType: 'happy', effectValue: 40, desc: '心情 +40', icon: 'toy_ball', name_en: 'Yarn ball', desc_en: 'Mood +40' },
  // 家具
  { itemId: 'fur_bed', name: '猫窝', category: 'furniture', price: 300, effectType: 'cleanRate', effectValue: -0.1, desc: '清洁度衰减 -10%', icon: 'fur_bed', name_en: 'Cat bed', desc_en: 'Clean decay -10%' },
  { itemId: 'fur_tree', name: '猫爬架', category: 'furniture', price: 500, effectType: 'happyRate', effectValue: -0.2, desc: '心情衰减 -20%', icon: 'fur_tree', name_en: 'Cat tree', desc_en: 'Mood decay -20%' },
  { itemId: 'fur_bowl', name: '自动喂食器', category: 'furniture', price: 800, effectType: 'hungerRate', effectValue: -0.2, desc: '饱食度衰减 -20%', icon: 'fur_bowl', name_en: 'Auto feeder', desc_en: 'Hunger decay -20%' },
  // 咪窝
  { itemId: 'home_2', name: '咪窝 II', category: 'home', price: 500, effectType: 'home', effectValue: 2, desc: '新增一个咪窝（可养 3 只）', icon: 'home', name_en: 'Room II', desc_en: 'One more room (3 cats)' },
  { itemId: 'home_3', name: '咪窝 III', category: 'home', price: 1000, effectType: 'home', effectValue: 3, desc: '新增一个咪窝（可养 3 只）', icon: 'home', name_en: 'Room III', desc_en: 'One more room (3 cats)' },
  { itemId: 'home_4', name: '咪窝 IV', category: 'home', price: 2000, effectType: 'home', effectValue: 4, desc: '新增一个咪窝（可养 3 只）', icon: 'home', name_en: 'Room IV', desc_en: 'One more room (3 cats)' },
  // 闯关道具（显示名全局统一，不带 x1 数量后缀）
  { itemId: 'prop_hint', name: '提示', category: 'prop', price: 50, effectType: 'item', effectValue: 'hint', desc: '高亮一对可消除图', icon: 'prop_hint', name_en: 'Hint', desc_en: 'Highlight a matchable pair' },
  { itemId: 'prop_shuffle', name: '洗牌', category: 'prop', price: 100, effectType: 'item', effectValue: 'shuffle', desc: '洗牌剩余方块', icon: 'prop_shuffle', name_en: 'Shuffle', desc_en: 'Reshuffle remaining tiles' },
  { itemId: 'prop_bomb', name: '炸弹', category: 'prop', price: 120, effectType: 'item', effectValue: 'bomb', desc: '炸掉 3×3 范围', icon: 'prop_bomb', name_en: 'Bomb', desc_en: 'Clear a 3x3 area' },
  { itemId: 'prop_time', name: '加时', category: 'prop', price: 80, effectType: 'item', effectValue: 'time', desc: '时间 +30 秒', icon: 'prop_time', name_en: '+Time', desc_en: 'Time +30s' }
];

var CATEGORIES = [
  { key: 'food', name_en: 'Food', name: '食物' },
  { key: 'toy', name_en: 'Toys', name: '玩具' },
  { key: 'furniture', name_en: 'Furniture', name: '家具' },
  { key: 'home', name_en: 'Rooms', name: '咪窝' },
  { key: 'prop', name_en: 'Items', name: '道具' }
];

function byId(id) {
  for (var i = 0; i < SHOP_ITEMS.length; i++) if (SHOP_ITEMS[i].itemId === id) return SHOP_ITEMS[i];
  return null;
}

function byCategory(cat) {
  var out = [];
  for (var i = 0; i < SHOP_ITEMS.length; i++) if (SHOP_ITEMS[i].category === cat) out.push(SHOP_ITEMS[i]);
  return out;
}

/**
 * 按当前语言取名字/描述（数据表里中英双写，缺 en 时回退中文）
 * 用 require 延迟取 i18n，避免和 i18n → save 的加载顺序打架
 */
function lang() {
  try { return require('./i18n.js').lang(); } catch (e) { return 'zh'; }
}
function nameOf(it) { return (lang() === 'en' && it.name_en) ? it.name_en : it.name; }
function descOf(it) { return (lang() === 'en' && it.desc_en) ? it.desc_en : it.desc; }
function catName(c) { return (lang() === 'en' && c.name_en) ? c.name_en : c.name; }

/** 4 种闯关道具的唯一键表（存档 / 逻辑 / UI 共用） */
var PROP_KEYS = ['hint', 'shuffle', 'bomb', 'time'];
function propItem(key) { return PROP_KEYS.indexOf(key) >= 0 ? byId('prop_' + key) : null; }
function propPrice(key) { var it = propItem(key); return it ? it.price : 0; }

module.exports = {
  SHOP_ITEMS: SHOP_ITEMS, CATEGORIES: CATEGORIES,
  byId: byId, byCategory: byCategory,
  PROP_KEYS: PROP_KEYS, propItem: propItem, propPrice: propPrice,
  nameOf: nameOf, descOf: descOf, catName: catName
};
