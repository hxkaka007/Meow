/**
 * 猫咪品种配置表（cat_types）——GDD 第六章
 * 每个品种对应一套图库前缀 + 稀有度 + 属性衰减系数
 */
var CAT_TYPES = [
  {
    typeId: 'ju', name: '橘猫', rarity: 'N', unlockLevel: 1, unlockMethod: 'levelUp',
    desc: '贪吃的大橘，食量惊人，体重诚实。', name_en: 'Orange Tabby', desc_en: 'A greedy orange cat, honest about its weight.',
    hungerRate: 1.2, cleanRate: 1.0, happyRate: 1.0, sicknessResist: 0, coinBonus: 0,
    imgPrefix: 'ju'
  },
  {
    typeId: 'bei', name: '英国短毛猫', rarity: 'N', unlockLevel: 1, unlockMethod: 'levelUp',
    desc: '圆脸短毛，性格温和，最适合新手。', name_en: 'British Shorthair', desc_en: 'Round face, short coat, gentle - great for beginners.',
    hungerRate: 1.0, cleanRate: 1.0, happyRate: 1.0, sicknessResist: 0, coinBonus: 0,
    imgPrefix: 'bei'
  },
  {
    typeId: 'buou', name: '布偶猫', rarity: 'R', unlockLevel: 5, unlockMethod: 'levelUp',
    desc: '蓝眼睛的温柔巨人，天生爱干净。', name_en: 'Ragdoll', desc_en: 'A gentle blue-eyed giant, naturally tidy.',
    hungerRate: 0.8, cleanRate: 1.0, happyRate: 1.0, sicknessResist: 0.05, coinBonus: 0.05,
    imgPrefix: 'buou'
  },
  {
    typeId: 'xianluo', name: '暹罗猫', rarity: 'R', unlockLevel: 10, unlockMethod: 'levelUp',
    desc: '重点色的小话痨，心情不容易低落。', name_en: 'Siamese', desc_en: 'A chatty little talker, rarely gets moody.',
    hungerRate: 1.0, cleanRate: 1.0, happyRate: 0.8, sicknessResist: 0, coinBonus: 0.05,
    imgPrefix: 'xianluo'
  },
  {
    typeId: 'zheer', name: '苏格兰折耳猫', rarity: 'R', unlockLevel: 15, unlockMethod: 'levelUp',
    desc: '折下的耳朵，安静坐在窗台一整天。', name_en: 'Scottish Fold', desc_en: 'Folded ears, sits quietly by the window all day.',
    hungerRate: 0.9, cleanRate: 1.0, happyRate: 1.0, sicknessResist: 0.1, coinBonus: 0,
    imgPrefix: 'zheer'
  },
  {
    typeId: 'bosi', name: '波斯猫', rarity: 'SR', unlockLevel: 25, unlockMethod: 'levelUp',
    desc: '长毛贵族，所有属性都掉得慢。', name_en: 'Persian', desc_en: 'A long-haired aristocrat, all stats decay slowly.',
    hungerRate: 0.8, cleanRate: 0.8, happyRate: 0.8, sicknessResist: 0.1, coinBonus: 0.1,
    imgPrefix: 'bosi'
  },
  {
    typeId: 'mianyin', name: '缅因猫', rarity: 'SR', unlockLevel: 35, unlockMethod: 'levelUp',
    desc: '体型巨大的温柔猎手，会帮你赚喵币。', name_en: 'Maine Coon', desc_en: 'A huge gentle hunter that helps you earn coins.',
    hungerRate: 1.0, cleanRate: 1.0, happyRate: 1.0, sicknessResist: 0, coinBonus: 0.1,
    imgPrefix: 'mianyin'
  },
  {
    typeId: 'bao', name: '孟加拉豹猫', rarity: 'SR', unlockLevel: 50, unlockMethod: 'levelUp',
    desc: '豹纹的野性之美，陪它玩容易出连击。', name_en: 'Bengal', desc_en: 'Wild leopard beauty, makes combos easier.',
    hungerRate: 1.2, cleanRate: 1.0, happyRate: 1.0, sicknessResist: 0, coinBonus: 0.15,
    imgPrefix: 'bao'
  },
  {
    typeId: 'wumao', name: '加拿大无毛猫', rarity: 'SSR', unlockLevel: 80, unlockMethod: 'levelUp',
    desc: '皮肤褶皱，需要极高的清洁照顾。', name_en: 'Sphynx', desc_en: 'Wrinkly skin, needs extra cleaning care.',
    hungerRate: 1.5, cleanRate: 1.5, happyRate: 1.0, sicknessResist: -0.05, coinBonus: 0.2,
    imgPrefix: 'wumao'
  },
  {
    typeId: 'sanhua', name: '三花猫', rarity: 'SSR', unlockLevel: 3, unlockMethod: 'activity',
    desc: '三色稀有，据说能带来好运。', name_en: 'Calico', desc_en: 'Rare three colors, said to bring good luck.',
    hungerRate: 1.0, cleanRate: 1.0, happyRate: 1.0, sicknessResist: 0.05, coinBonus: 0.2,
    imgPrefix: 'sanhua'
  },
  {
    typeId: 'yiguo', name: '异国短毛猫', rarity: 'SSR', unlockLevel: 100, unlockMethod: 'levelUp',
    desc: '扁脸大佬，全属性抗性极高。', name_en: 'Exotic Shorthair', desc_en: 'Flat-faced boss with very high resistance.',
    hungerRate: 0.7, cleanRate: 0.7, happyRate: 0.7, sicknessResist: 0.25, coinBonus: 0.25,
    imgPrefix: 'yiguo'
  },
  {
    typeId: 'lihua', name: '狸花猫', rarity: 'N', unlockLevel: 2, unlockMethod: 'levelUp',
    desc: '中华本土神猫，皮实好养。', name_en: 'Dragon Li', desc_en: 'A hardy native cat, easy to keep.',
    hungerRate: 1.1, cleanRate: 0.9, happyRate: 1.0, sicknessResist: 0.05, coinBonus: 0,
    imgPrefix: 'lihua'
  }
];

/** 疾病表 —— GDD 第九章 */
var SICKNESS = {
  cold: { id: 'cold', name: '感冒', cost: 100, desc: '打喷嚏、流鼻涕', name_en: 'Cold', desc_en: 'sneezing, runny nose', emoji: '🤧', icon: 'cold' },
  skin: { id: 'skin', name: '皮肤病', cost: 200, desc: '掉毛、不停抓挠', name_en: 'Skin disease', desc_en: 'hair loss, scratching', emoji: '🩹', icon: 'skin' },
  stomach: { id: 'stomach', name: '肠胃炎', cost: 300, desc: '呕吐、拉肚子', name_en: 'Gastritis', desc_en: 'vomiting, diarrhea', emoji: '🤢', icon: 'stomach' },
  bone: { id: 'bone', name: '骨折', cost: 500, desc: '走路一瘸一拐', name_en: 'Fracture', desc_en: 'limping when walking', emoji: '🦴', icon: 'bone' },
  depress: { id: 'depress', name: '抑郁症', cost: 150, desc: '不想动、趴着发呆', name_en: 'Depression', desc_en: 'listless, staring blankly', emoji: '😔', icon: 'depress' }
};

/** 稀有度配色 */
var RARITY = {
  N: { color: '#9aa8b8', label: 'N', stars: 1 },
  R: { color: '#5aa8e0', label: 'R', stars: 2 },
  SR: { color: '#b06ce0', label: 'SR', stars: 3 },
  SSR: { color: '#f0a030', label: 'SSR', stars: 4 }
};

function typeById(id) {
  for (var i = 0; i < CAT_TYPES.length; i++) if (CAT_TYPES[i].typeId === id) return CAT_TYPES[i];
  return CAT_TYPES[0];
}

/** 已解锁品种（按关卡/活动） */
function unlockedTypes(level, hasActivityCoupon) {
  var out = [];
  for (var i = 0; i < CAT_TYPES.length; i++) {
    var t = CAT_TYPES[i];
    if (t.unlockMethod === 'levelUp' && level >= t.unlockLevel) out.push(t);
    else if (t.unlockMethod === 'activity' && hasActivityCoupon) out.push(t);
  }
  return out;
}

/** 按当前语言取名（缺 en 回退中文） */
function lang() {
  try { return require('./i18n.js').lang(); } catch (e) { return 'zh'; }
}
function typeName(t) { return (lang() === 'en' && t.name_en) ? t.name_en : t.name; }
function typeDesc(t) { return (lang() === 'en' && t.desc_en) ? t.desc_en : t.desc; }
function sickName(s) { return (lang() === 'en' && s.name_en) ? s.name_en : s.name; }
function sickDesc(s) { return (lang() === 'en' && s.desc_en) ? s.desc_en : s.desc; }

module.exports = {
  CAT_TYPES: CAT_TYPES,
  SICKNESS: SICKNESS,
  RARITY: RARITY,
  typeById: typeById,
  unlockedTypes: unlockedTypes,
  typeName: typeName, typeDesc: typeDesc,
  sickName: sickName, sickDesc: sickDesc
};
