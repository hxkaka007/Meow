/**
 * 咪窝「领养品种表」—— 每一项对应 assets/textures/breeds/ 下一张整猫立绘。
 *
 * 25 张原图来自 assets/textures/cats/ 里的中文名 3D 版整猫图，由
 * .workbuddy/build_breed_assets.py 抠白底 / 去水印 / 统一画布生成（ASCII 文件名）。
 * 注意：cats/cat_atlas.png 是连连看棋子雪碧图，与本表无关，绝不改动。
 *
 * 字段：
 *   id      本次领养选中的品种 id，写进猫咪实例的 breedId
 *   zh/en   品种显示名
 *   rarity  稀有度（决定领养价）
 *   typeId  映射到 catTypes.js 的既有品种，决定属性衰减 / 心情 / 图鉴
 *   art     assets/textures/breeds/ 下的文件名
 *   face    cats/cat_atlas.png 里的猫头帧号 0..23（信息卡左侧圆形头像用）
 *
 * 猫头帧按花色贴近度人工分配，24 帧覆盖 25 个品种（两只纯白猫共用 9 号帧）。
 * 这里只「读取」cat_atlas.png，绝不修改它（它同时是连连看棋子图集）。
 * 老存档的猫没有 breedId，artOf() / faceOf() 会按 typeId 退回对应的第一张立绘。
 */
var P = 'assets/textures/breeds/';

var BREEDS = [
  { id: 'calico', zh: '三花猫', en: 'Calico', rarity: 'SSR', typeId: 'sanhua', art: 'calico.png', face: 4 },
  { id: 'birman', zh: '伯曼猫', en: 'Birman', rarity: 'R', typeId: 'buou', art: 'birman.png', face: 20 },
  { id: 'selkirk', zh: '塞尔柯克卷毛猫', en: 'Selkirk Rex', rarity: 'SR', typeId: 'bosi', art: 'selkirk.png', face: 18 },
  { id: 'ragdoll', zh: '布偶猫', en: 'Ragdoll', rarity: 'R', typeId: 'buou', art: 'ragdoll.png', face: 2 },
  { id: 'devon_rex', zh: '德文卷毛猫', en: 'Devon Rex', rarity: 'SSR', typeId: 'wumao', art: 'devon_rex.png', face: 19 },
  { id: 'scottish_fold', zh: '苏格兰折耳猫', en: 'Scottish Fold', rarity: 'R', typeId: 'zheer', art: 'scottish_fold.png', face: 7 },
  { id: 'sphynx', zh: '斯芬克斯无毛猫', en: 'Sphynx', rarity: 'SSR', typeId: 'wumao', art: 'sphynx.png', face: 13 },
  { id: 'siamese', zh: '暹罗猫', en: 'Siamese', rarity: 'R', typeId: 'xianluo', art: 'siamese.png', face: 6 },
  { id: 'brown_tabby', zh: '棕虎斑', en: 'Brown Tabby', rarity: 'N', typeId: 'lihua', art: 'brown_tabby.png', face: 8 },
  { id: 'orange_flatface', zh: '橘扁脸猫', en: 'Orange Flat-face', rarity: 'SSR', typeId: 'yiguo', art: 'orange_flatface.png', face: 15 },
  { id: 'orange_bicolor', zh: '橘白双色猫', en: 'Orange & White', rarity: 'N', typeId: 'ju', art: 'orange_bicolor.png', face: 23 },
  { id: 'orange_tabby', zh: '橘虎斑', en: 'Orange Tabby', rarity: 'N', typeId: 'ju', art: 'orange_tabby.png', face: 1 },
  { id: 'persian', zh: '波斯猫', en: 'Persian', rarity: 'SR', typeId: 'bosi', art: 'persian.png', face: 5 },
  { id: 'persian_longhair', zh: '波斯长毛猫', en: 'Persian Longhair', rarity: 'SR', typeId: 'bosi', art: 'persian_longhair.png', face: 21 },
  { id: 'lightgrey_longhair', zh: '浅灰长毛猫', en: 'Light Grey Longhair', rarity: 'SR', typeId: 'mianyin', art: 'lightgrey_longhair.png', face: 10 },
  { id: 'dark_tabby', zh: '深纹虎斑', en: 'Dark Tabby', rarity: 'N', typeId: 'lihua', art: 'dark_tabby.png', face: 16 },
  { id: 'grey_sphynx', zh: '灰斯芬克斯', en: 'Grey Sphynx', rarity: 'SSR', typeId: 'wumao', art: 'grey_sphynx.png', face: 17 },
  { id: 'white_round', zh: '白圆胖猫', en: 'Chubby White', rarity: 'N', typeId: 'bei', art: 'white_round.png', face: 9 },
  { id: 'white_longhair', zh: '白色长毛猫', en: 'White Longhair', rarity: 'SR', typeId: 'mianyin', art: 'white_longhair.png', face: 14 },
  { id: 'white_shorthair', zh: '纯白短毛猫', en: 'White Shorthair', rarity: 'N', typeId: 'bei', art: 'white_shorthair.png', face: 9 },
  { id: 'black', zh: '纯黑猫', en: 'Black Cat', rarity: 'N', typeId: 'lihua', art: 'black.png', face: 3 },
  { id: 'blue_greeneyes', zh: '蓝灰绿眼猫', en: 'Blue Green-eyed', rarity: 'N', typeId: 'bei', art: 'blue_greeneyes.png', face: 12 },
  { id: 'british_blue', zh: '英国蓝猫', en: 'British Blue', rarity: 'N', typeId: 'bei', art: 'british_blue.png', face: 0 },
  { id: 'bengal', zh: '孟加拉豹猫', en: 'Bengal', rarity: 'SR', typeId: 'bao', art: 'bengal.png', face: 11 },
  { id: 'abyssinian', zh: '阿比西尼亚猫', en: 'Abyssinian', rarity: 'N', typeId: 'lihua', art: 'abyssinian.png', face: 22 }
];

/** 领养价，与旧版按稀有度定价一致；猫屋为空时第一只免费 */
var PRICE = { N: 300, R: 600, SR: 1200, SSR: 2400 };

var ALL = (function () {
  var a = [];
  for (var i = 0; i < BREEDS.length; i++) a.push(P + BREEDS[i].art);
  return a;
})();

function lang() {
  try { return require('./i18n.js').lang(); } catch (e) { return 'zh'; }
}

function byId(id) {
  for (var i = 0; i < BREEDS.length; i++) if (BREEDS[i].id === id) return BREEDS[i];
  return null;
}

function byType(typeId) {
  for (var i = 0; i < BREEDS.length; i++) if (BREEDS[i].typeId === typeId) return BREEDS[i];
  return null;
}

function nameOf(b) {
  if (!b) return '';
  return lang() === 'en' ? b.en : b.zh;
}

/** 品种 -> 完整图片路径 */
function artPath(b) { return b ? P + b.art : ''; }

/** 猫咪实例 -> 完整图片路径；老存档按 typeId 退回 */
function artOf(cat) {
  if (!cat) return '';
  var b = byId(cat.breedId) || byType(cat.typeId);
  return artPath(b);
}

/** 猫咪实例 -> cat_atlas.png 帧号；老存档按 typeId 退回 sprites.catFrames */
function faceOf(cat) {
  if (!cat) return null;
  var b = byId(cat.breedId) || byType(cat.typeId);
  if (b && b.face !== undefined) return b.face;
  try {
    var S = require('./sprites.js');
    var i = S.catFrames[cat.typeId];
    return i === undefined ? 0 : i;
  } catch (e) { return 0; }
}

function priceOf(b) { return b ? (PRICE[b.rarity] || 300) : 300; }

module.exports = {
  P: P,
  BREEDS: BREEDS,
  ALL: ALL,
  PRICE: PRICE,
  byId: byId,
  byType: byType,
  nameOf: nameOf,
  artPath: artPath,
  artOf: artOf,
  faceOf: faceOf,
  priceOf: priceOf,
  count: BREEDS.length
};
