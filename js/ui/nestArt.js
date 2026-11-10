/**
 * 咪窝（小喵屋）· 真实分层美术绘制层
 *
 * 素材来自用户提供的「图片_分图层_1 (2).zip」11 张分层图，
 * 由 .workbuddy/build_nest_assets.py 加工到 assets/textures/nest/：
 *   topbar.png / logo.png / props.png / cat.png / bubble.png
 *   navbar.png[|_clean] / actions.png[|_clean] / infocard.png[|_clean]
 *   coinbar.png[|_clean] / settings.png[|_clean]
 * 中文界面直接用原图里的美术字（像素级还原参考图），只把会变化的数值
 * （金币、四个属性）抹掉后由 Canvas 重绘；英文界面改用 *_clean 版，
 * 固定文案也按 i18n 在运行期重绘。
 *
 * 背景不使用素材包里的桃粉柔光图：默认皮肤画较深的奶油杏色渐变（paintNestBg），
 * 切到其它皮肤时才回落到全站 Theme.paintBg，保证一键换肤不会串色。
 * 舞台里大猫的水平中心对齐「左猫窝 / 右抱枕」的中点，猫脚略低于装饰底边。
 * 每个部件在图片未加载时都有纯 Canvas 兜底，首帧 / 真机偶发加载失败不会白屏。
 * 布局以参考设计稿 1078x1920 为基准，按屏宽缩放固定高度部件，
 * 剩余纵向空间全部给「大猫 + 装饰」舞台区。
 */
var D = require('./draw.js');
var I = require('../core/i18n.js');
var Theme = require('../core/theme.js');
var SPRITES = require('../core/sprites.js');
var Rig = require('./catRig.js');

var P = 'assets/textures/nest/';

var FILE = {
  topbar: 'topbar.png',
  logo: 'logo.png',
  props: 'props.png',
  cat: 'cat.png',
  bubble: 'bubble.png',
  navbar: 'navbar.png',
  navbarClean: 'navbar_clean.png',
  actions: 'actions.png',
  actionsClean: 'actions_clean.png',
  infocard: 'infocard.png',
  infocardClean: 'infocard_clean.png',
  coinbar: 'coinbar.png',
  coinbarClean: 'coinbar_clean.png',
  settings: 'settings.png',
  settingsClean: 'settings_clean.png'
};

/** 预加载清单（供 render.js preload 使用） */
var ALL = (function () {
  var a = [];
  for (var k in FILE) if (FILE.hasOwnProperty(k)) a.push(P + FILE[k]);
  return a;
})();

/** 素材固有宽高比（按生成后的实际像素） */
var R = {
  topbar: 780 / 88, logo: 260 / 133, props: 780 / 192,
  cat: 460 / 501, bubble: 220 / 198, navbar: 780 / 157,
  actions: 740 / 139, infocard: 730 / 427,
  coinbar: 360 / 85, settings: 240 / 126
};

/** 设计稿 1078x1920 里四个状态卡 / 四个按钮 / 四个导航项的中心比例 */
var STAT_X = [0.138, 0.377, 0.618, 0.863];   // 信息卡内的相对 x
var ACT_X = [0.109, 0.373, 0.637, 0.895];   // 按钮条内的相对 x
var NAV_X = [0.129, 0.376, 0.625, 0.877];   // 导航条内的相对 x

var BROWN = '#7A3D18';
var CREAM = 'rgba(255,250,238,0.92)';

// 咪窝专用底色：比全站主题更深的奶油杏色（对齐参考截图，上下略深、中间柔亮）。
// 只在默认 cream 皮肤下使用；切到其它皮肤时仍跟全站 Theme.paintBg 保持一致。
var NEST_BG_TOP = '#F8E2CB';
var NEST_BG_MID = '#FAE9DA';
var NEST_BG_BOT = '#F9E9DA';

function paintNestBg(ctx, W, H) {
  if (Theme.currentId() !== 'cream') { Theme.paintBg(ctx, W, H, 0); return; }
  var g = null;
  try { if (ctx.createLinearGradient) g = ctx.createLinearGradient(0, 0, 0, H); } catch (e) { }
  if (g && g.addColorStop) {
    g.addColorStop(0, NEST_BG_TOP);
    g.addColorStop(0.46, NEST_BG_MID);
    g.addColorStop(1, NEST_BG_BOT);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = NEST_BG_MID;
  }
  ctx.fillRect(0, 0, W, H);
  // 极淡的四周暖光：参考图不是纯色块，中心偏亮、四角略沉
  var v = null;
  try {
    if (ctx.createRadialGradient)
      v = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.16, W / 2, H * 0.42, H * 0.78);
  } catch (e) { }
  if (v && v.addColorStop) {
    v.addColorStop(0, 'rgba(255,250,238,0.10)');
    v.addColorStop(1, 'rgba(226,190,145,0.08)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
}

function image(ctx, engine, file, x, y, w, h) {
  return imageAt(ctx, engine, P + file, x, y, w, h);
}

/** 完整路径版：领养品种立绘在 assets/textures/breeds/，不在 nest/ 目录 */
function imageAt(ctx, engine, fullPath, x, y, w, h) {
  if (!engine || !engine.img || !fullPath) return false;
  var im = engine.img(fullPath);
  if (!im || !im.width) return false;
  try { ctx.drawImage(im, x, y, w, h); } catch (e) { return false; }
  return true;
}

/**
 * 从雪碧图取一帧绘制（信息卡圆形头像用 cats/cat_atlas.png 的猫头帧）。
 * 只读取图集，绝不修改；drawSprite 依赖 Engine 实例，这里直接用 engine.img
 * 以便预览 / 冒烟脚本的 mock engine 也能走同一条路径。
 */
function spriteAt(ctx, engine, atlas, index, dx, dy, dw, dh) {
  if (!engine || !engine.img || index === null || index === undefined) return false;
  var a = SPRITES.atlases[atlas];
  if (!a) return false;
  var im = engine.img(a.path);
  if (!im || !im.width) return false;
  var rc = SPRITES.rect(atlas, index);
  if (!rc) return false;
  var k = Math.min(dw / rc.sw, dh / rc.sh);
  var w = rc.sw * k, h = rc.sh * k;
  try {
    ctx.drawImage(im, rc.sx, rc.sy, rc.sw, rc.sh,
      dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
  } catch (e) { return false; }
  return true;
}

/** 贴纸感文字：外描边 + 填充 */
function ink(ctx, str, cx, cy, size, color, opt) {
  opt = opt || {};
  var s = Math.max(6, Math.round(size));
  ctx.save();
  ctx.font = (opt.bold === false ? '' : '900 ') + s + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (opt.stroke) {
    ctx.strokeStyle = opt.stroke;
    ctx.lineWidth = opt.strokeW || Math.max(1.5, s * 0.22);
    ctx.strokeText(String(str), cx, cy);
  }
  ctx.fillStyle = color;
  ctx.fillText(String(str), cx, cy);
  ctx.restore();
}

function rr(ctx, x, y, w, h, r, fill, stroke, lw) {
  ctx.save();
  D.roundRect(ctx, x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
  ctx.restore();
}

// ---------------------------------------------------------------- 布局
/**
 * @param {number} W 逻辑屏宽
 * @param {number} H 逻辑屏高
 * @param {number} safeTop 顶部安全区（灵动岛）
 */
function layout(W, H, safeTop) {
  var pad = W * 0.030;
  var st = Math.min(Math.max(safeTop || 0, 0), H * 0.10);
  var en = I.lang() === 'en';

  // 顶部胶囊整条下移避让灵动岛（它横贯屏幕，中间正好压住金币条）
  var topW = W - pad * 2;
  var topH = topW / R.topbar;
  var top = { x: pad, y: Math.max(H * 0.012, st + H * 0.010), w: topW, h: topH };

  var navH = W / R.navbar;
  var nav = { x: 0, y: H - navH, w: W, h: navH };

  var actW = W - pad * 2;
  var actH = actW / R.actions;
  var act = { x: pad, y: nav.y - W * 0.045 - actH, w: actW, h: actH };

  var cardW = W - pad * 2;
  var cardH = cardW / R.infocard;
  var card = { x: pad, y: act.y - W * 0.040 - cardH, w: cardW, h: cardH };

  var stageY = top.y + top.h;
  var stageH = Math.max(80, card.y - stageY);
  var stage = { x: 0, y: stageY, w: W, h: stageH };

  // 顶栏内三件套：高度驱动、按素材比例求宽，保证金币与齿轮不被压扁
  var logoH = top.h * 0.82, logoW = logoH * R.logo;
  var setH = top.h * 0.88, setW = setH * R.settings;
  var coinH = top.h * 0.78, coinW = coinH * R.coinbar;
  var logo = { x: top.x + W * 0.018, y: top.y + (top.h - logoH) / 2, w: logoW, h: logoH };
  var settings = { x: top.x + top.w - W * 0.018 - setW, y: top.y + (top.h - setH) / 2, w: setW, h: setH };
  var coin = { x: settings.x - coinW - W * 0.012, y: top.y + (top.h - coinH) / 2, w: coinW, h: coinH };
  if (coin.x < logo.x + logoW + W * 0.02) {   // 极窄屏：金币条整体等比缩小
    var k = (settings.x - (logo.x + logoW + W * 0.02) - W * 0.012) / coinW;
    coin.w *= k; coin.h *= k; coin.x = settings.x - coin.w - W * 0.012;
    coin.y = top.y + (top.h - coin.h) / 2;
  }

  // 舞台：装饰横幅里左侧猫窝中心 ~0.18、右侧抱枕中心 ~0.87，两者中点 ~0.523。
  // 大猫必须落在这个中点上，才是「坐在左边猫窝和右边抱枕中间」；
  // 同时猫脚压到装饰底边略下方，让猫与左右装饰成一组，而不是悬在装饰上方。
  var propsW = W * 0.98, propsH = propsW / R.props;
  // 舞台比设计稿高出的那段纵向余量平分到「顶栏→猫」和「装饰→信息卡」两侧，
  // 让猫+装饰这一组居中，不会上方空一大块、下方又贴死信息卡。
  var props = { x: W * 0.01, y: stage.y + stage.h * 0.55, w: propsW, h: propsH };
  if (props.y + propsH > card.y - W * 0.02) props.y = card.y - W * 0.02 - propsH;
  var PROP_MID = 0.523;

  // 长屏（如 390x844）比设计稿瘦长，舞台区多出的高度让大猫等比放大一点
  var catW0 = W * 0.50;
  var grow = 1 + Math.min(0.10, Math.max(0, (stage.h / W - 0.62) * 0.35));
  var catW = catW0 * grow, catH = catW / R.cat;
  var catFoot = props.y + propsH * 1.16;
  var cat = {
    x: props.x + props.w * PROP_MID - catW / 2,
    y: catFoot - catH,
    w: catW, h: catH
  };
  if (cat.y + catH > card.y - W * 0.012) cat.y = card.y - W * 0.012 - catH;
  if (cat.y < stage.y + stage.h * 0.04) cat.y = stage.y + stage.h * 0.04;
  var bubW = W * 0.165, bubH = bubW / R.bubble;
  var bubble = { x: W * 0.755, y: stage.y + stage.h * 0.18, w: bubW, h: bubH };

  // 点击热区
  var actionBtns = [], navBtns = [], i;
  var aKeys = ['feed', 'play', 'wash', 'rest'];
  for (i = 0; i < 4; i++) actionBtns.push({
    key: aKeys[i], x: act.x + act.w * (i / 4), y: act.y, w: act.w / 4, h: act.h
  });
  var nKeys = ['home', 'cats', 'shop', 'hospital'];
  for (i = 0; i < 4; i++) navBtns.push({
    key: nKeys[i], x: W * (i / 4), y: nav.y, w: W / 4, h: nav.h
  });

  return {
    W: W, H: H, en: en, safeTop: st, pad: pad,
    top: top, logo: logo, coin: coin, settings: settings,
    stage: stage, props: props, cat: cat, bubble: bubble,
    card: card, act: act, nav: nav,
    actionBtns: actionBtns, navBtns: navBtns,
    // 信息卡左半的圆形头像 -> 领养；右半 -> 猫咪详情
    avatarHit: { x: card.x + card.w * 0.02, y: card.y + card.h * 0.02, w: card.w * 0.33, h: card.h * 0.52 },
    cardHit: { x: card.x + card.w * 0.34, y: card.y + card.h * 0.02, w: card.w * 0.64, h: card.h * 0.52 },
    catHit: cat, bubbleHit: bubble, settingsHit: settings, coinHit: coin
  };
}

// ---------------------------------------------------------------- 兜底绘制
function fbTop(ctx, L) {
  rr(ctx, L.top.x, L.top.y, L.top.w, L.top.h, L.top.h / 2, '#FFF9EE', '#EFC79C', 2);
}

function fbPlate(ctx, r, radius, fill, stroke) {
  rr(ctx, r.x, r.y, r.w, r.h, radius, fill, stroke, 2);
}

function fbCat(ctx, L) {
  var c = L.cat, cx = c.x + c.w / 2, cy = c.y + c.h * 0.58;
  ctx.save();
  ctx.fillStyle = '#F5A45C';
  ctx.beginPath(); ctx.ellipse(cx, cy + c.h * 0.16, c.w * 0.34, c.h * 0.30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy - c.h * 0.10, c.w * 0.29, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - c.w * 0.27, cy - c.h * 0.27); ctx.lineTo(cx - c.w * 0.30, cy - c.h * 0.48);
  ctx.lineTo(cx - c.w * 0.10, cy - c.h * 0.33); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + c.w * 0.27, cy - c.h * 0.27); ctx.lineTo(cx + c.w * 0.30, cy - c.h * 0.48);
  ctx.lineTo(cx + c.w * 0.10, cy - c.h * 0.33); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FFF6E8';
  ctx.beginPath(); ctx.ellipse(cx, cy + c.h * 0.02, c.w * 0.18, c.h * 0.20, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4A2A18';
  ctx.beginPath(); ctx.arc(cx - c.w * 0.11, cy - c.h * 0.12, c.w * 0.052, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + c.w * 0.11, cy - c.h * 0.12, c.w * 0.052, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function fbProps(ctx, L) {
  var p = L.props;
  ctx.save();
  ctx.fillStyle = '#E8D2B4';
  ctx.beginPath(); ctx.ellipse(p.x + p.w * 0.16, p.y + p.h * 0.52, p.w * 0.13, p.h * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F6C8C8';
  ctx.beginPath(); ctx.ellipse(p.x + p.w * 0.87, p.y + p.h * 0.42, p.w * 0.11, p.h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function fbBubble(ctx, L) {
  var b = L.bubble;
  rr(ctx, b.x, b.y, b.w, b.h * 0.70, b.h * 0.34, '#FFFDF8', '#F0D6B8', 2);
  ctx.save();
  ctx.fillStyle = '#F4748C';
  var cx = b.x + b.w / 2, cy = b.y + b.h * 0.34, s = b.w * 0.26;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.5, cy, cx - s * 0.8, cy - s * 1.1, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.8, cy - s * 1.1, cx + s * 1.5, cy, cx, cy + s * 0.9);
  ctx.fill();
  ctx.restore();
}

function fbCard(ctx, L, statRects) {
  var c = L.card;
  rr(ctx, c.x, c.y, c.w, c.h, c.h * 0.075, '#F7B766', '#E8943C', 3);
  rr(ctx, c.x + c.w * 0.026, c.y + c.h * 0.035, c.w * 0.948, c.h * 0.55,
    c.h * 0.055, '#FFFAF0', '#EFD3AE', 2);
  ctx.save();
  ctx.fillStyle = '#E8CFB4';
  ctx.beginPath(); ctx.arc(c.x + c.w * 0.17, c.y + c.h * 0.30, c.h * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  for (var i = 0; i < 4; i++) {
    rr(ctx, statRects[i].x, statRects[i].y, statRects[i].w, statRects[i].h,
      statRects[i].h * 0.16, '#FFFBF2', '#EBD3B4', 1.5);
  }
}

function fbActions(ctx, L) {
  var cols = ['#F9B268', '#F6B6BE', '#A9DCB4', '#A6CBE8'];
  for (var i = 0; i < 4; i++) {
    var b = L.actionBtns[i];
    rr(ctx, b.x + b.w * 0.05, b.y + b.h * 0.06, b.w * 0.90, b.h * 0.88,
      b.h * 0.30, cols[i], 'rgba(255,255,255,0.8)', 2);
  }
}

function fbNav(ctx, L) {
  rr(ctx, 0, L.nav.y, L.W, L.nav.h, L.nav.h * 0.22, '#FFF8EC', '#EFD0A8', 2);
  for (var i = 0; i < 4; i++) {
    var cx = L.W * NAV_X[i], cy = L.nav.y + L.nav.h * 0.42;
    ctx.save();
    ctx.fillStyle = i === 1 ? '#F39B4A' : '#D9C5AE';
    ctx.beginPath(); ctx.ellipse(cx, cy + L.nav.h * 0.10, L.nav.h * 0.13, L.nav.h * 0.10, 0, 0, Math.PI * 2); ctx.fill();
    for (var k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(cx + (k - 1.5) * L.nav.h * 0.105, cy - L.nav.h * 0.13, L.nav.h * 0.048, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * 信息卡左侧的圆形猫咪头像：按领养品种从 cats/cat_atlas.png 取对应猫头帧。
 *
 * 素材里那只烘焙的 3D 橘猫已由 build_nest_assets.py 的 clear_avatar() 清空，
 * 这里重新画圆底 + 猫头 + 细边框。空窝时不画猫（只留干净圆底），
 * 图集未就绪时退回 engine.drawCat → 纯 Canvas 简笔猫脸，不会露出白框。
 * 圆心与 clear_avatar() 的 (146,123) 一致；半径取 99 比素材圆盘 93 略大，
 * 正好盖住原图圆形底板残留的一圈淡棕阴影，只留下面新画的这条细边框。
 */
function paintAvatar(ctx, engine, L, data) {
  var c = L.card;
  var cx = c.x + c.w * (146 / 730);
  var cy = c.y + c.h * (123 / 427);
  var r = c.w * (99 / 730);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  var g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, '#FDF7EF');
  g.addColorStop(1, '#F9EBDA');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  if (!data.empty && data.catFace !== null && data.catFace !== undefined) {
    // 猫头帧是透明底的半身像，略偏上铺进圆里，下巴刚好落在圆内。
    // 头像是静态图：直接取 cat_atlas.png 对应的猫头帧绘制（只读不改），
    // 随品种变化，不再做眨眼 / 嗅鼻 / 张嘴 / 点头等可动部件合成。
    var bx = cx - r * 0.94, by = cy - r * 1.06, bw = r * 1.88, bh = r * 2.12;
    var ok = spriteAt(ctx, engine, 'cat', data.catFace, bx, by, bw, bh);
    if (!ok && engine && engine.drawCat) {
      ok = engine.drawCat(ctx, data.catType || 'ju', bx, by, bw, bh);
    }
    if (!ok) D.catFace(ctx, cx, cy - r * 0.06, r * 0.64, 28);
  }
  ctx.restore();

  // 细圆边：替代被清掉的原图深棕描边
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.995, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(216,182,142,0.85)';
  ctx.lineWidth = Math.max(1.2, c.w * 0.0035);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- 主绘制
/**
 * @param {object} data { coin, catName, sign, stats:[4], catArt, catFace, empty? }
 * @returns {object} L 布局（含热区）
 */
function paint(ctx, engine, L, data) {
  data = data || {};
  var en = L.en;
  var W = L.W, H = L.H;
  var stats = data.stats || [0, 0, 0, 0];

  // 背景：默认皮肤用咪窝专属的较深奶油杏色，换肤时回到全站主题渐变
  paintNestBg(ctx, W, H);

  // 舞台：装饰 -> 大猫 -> 气泡
  // 空窝（还没领养）时上方一只猫都不画；领养后按 breedId 对应的整猫立绘显示，
  // 图片偶发未加载时用纯 Canvas 简笔猫兜底，不会白屏也不会串成别的品种。
  if (!image(ctx, engine, FILE.props, L.props.x, L.props.y, L.props.w, L.props.h)) fbProps(ctx, L);
  if (!data.empty) {
    // 品种立绘自带一圈透明留白，等比放大一点才和原 nest/cat.png 里的橘猫一样大；
    // 底边对齐 L.cat，猫脚位置不变，不会往下压到信息卡。
    var cw = L.cat.w * 1.12, ch = L.cat.h * 1.12;
    var cx = L.cat.x + (L.cat.w - cw) / 2;
    var cy = L.cat.y + L.cat.h - ch;
    // 可动部件：眼睛眨 / 鼻子嗅 / 嘴巴喵 / 身体呼吸摆动，25 个品种共用同一套逻辑
    var rigOK = false;
    if (data.catArt) {
      var bo = Rig.breedOpts(engine, data.catArt, cx, cy, cw, ch, {
        t: data.rigT, seed: data.rigSeed, happy: data.rigHappy, mode: 'full'
      });
      if (bo) rigOK = Rig.paint(ctx, engine, bo);
    }
    if (!rigOK && data.catArt) rigOK = imageAt(ctx, engine, data.catArt, cx, cy, cw, ch);
    if (!rigOK) fbCat(ctx, L);
  }
  if (!image(ctx, engine, FILE.bubble, L.bubble.x, L.bubble.y, L.bubble.w, L.bubble.h)) fbBubble(ctx, L);

  // 顶部胶囊 + 三件套
  if (!image(ctx, engine, FILE.topbar, L.top.x, L.top.y, L.top.w, L.top.h)) fbTop(ctx, L);
  if (!en) {
    if (!image(ctx, engine, FILE.logo, L.logo.x, L.logo.y, L.logo.w, L.logo.h)) {
      ink(ctx, I.t('room'), L.logo.x + L.logo.w / 2, L.top.y + L.top.h / 2,
        L.top.h * 0.50, BROWN);
    }
  } else {
    ink(ctx, I.t('room'), L.logo.x + L.logo.w / 2, L.top.y + L.top.h / 2,
      L.top.h * 0.36, BROWN);
  }
  var coinOK = image(ctx, engine, en ? FILE.coinbarClean : FILE.coinbar,
    L.coin.x, L.coin.y, L.coin.w, L.coin.h);
  if (!coinOK) fbPlate(ctx, L.coin, L.coin.h / 2, '#FFF3DE', '#E9BE83');
  if (en) {
    ink(ctx, I.t('coinLabel'), L.coin.x + L.coin.w * 0.38, L.coin.y + L.coin.h * 0.52,
      L.coin.h * 0.30, BROWN);
  }
  ink(ctx, data.coin === undefined ? 0 : data.coin,
    L.coin.x + L.coin.w * 0.755, L.coin.y + L.coin.h * 0.52,
    L.coin.h * 0.44, BROWN, { stroke: CREAM, strokeW: Math.max(1.2, L.coin.h * 0.055) });

  var setOK = image(ctx, engine, en ? FILE.settingsClean : FILE.settings,
    L.settings.x, L.settings.y, L.settings.w, L.settings.h);
  if (!setOK) fbPlate(ctx, L.settings, L.settings.h / 2, '#FFEFD8', '#E7C39B');
  if (en) {
    // 英文单词比中文长，设置胶囊里只放短标签，避免压到齿轮图标
    ink(ctx, I.t('nestSetShort'), L.settings.x + L.settings.w * 0.73,
      L.settings.y + L.settings.h * 0.52, L.settings.h * 0.24, BROWN);
  }

  // 信息卡：只有「中文 + 素材里烘焙的那只奶糖」才用原版美术字；
  // 英文 / 空窝 / 领养了别的品种，都改用抹字版运行期重绘，名字才跟品种对得上。
  var empty = !!data.empty;
  var redrawCard = !!(en || empty || (data.catName && data.catName !== '奶糖'));
  var cardOK = image(ctx, engine, redrawCard ? FILE.infocardClean : FILE.infocard,
    L.card.x, L.card.y, L.card.w, L.card.h);
  var statRects = [];
  for (var i = 0; i < 4; i++) {
    statRects.push({
      x: L.card.x + L.card.w * (0.035 + i * 0.242),
      y: L.card.y + L.card.h * 0.645,
      w: L.card.w * 0.212, h: L.card.h * 0.30
    });
  }
  if (!cardOK) fbCard(ctx, L, statRects);

  // 圆形头像：按品种画 cat_atlas 猫头（空窝留空），要在文字之前画，避免压到名字
  paintAvatar(ctx, engine, L, data);

  if (redrawCard) {
    var cname = empty ? I.t('roomEmpty') : (data.catName || '');
    var csign = empty ? I.t('adoptFirst') : (data.sign || '');
    // 长英文名 / 签名自动缩字号，避免压到左侧圆形头像
    ink(ctx, cname, L.card.x + L.card.w * 0.545, L.card.y + L.card.h * 0.177,
      D.fit(cname, L.card.h * 0.105, L.card.w * 0.46), BROWN);
    ink(ctx, csign, L.card.x + L.card.w * 0.62, L.card.y + L.card.h * 0.370,
      D.fit(csign, L.card.h * 0.062, L.card.w * 0.52), '#5A3A22', { bold: false });
  }
  for (i = 0; i < 4; i++) {
    var sx = L.card.x + L.card.w * STAT_X[i];
    if (redrawCard) {
      var lab = I.t('nestStat' + i);
      ink(ctx, lab, sx + L.card.w * 0.038, L.card.y + L.card.h * 0.735,
        D.fit(lab, L.card.h * 0.062, L.card.w * 0.145), BROWN);
    }
    // 数字写在小胶囊右半，避开左侧的火焰 / 水滴 / 苹果图标
    ink(ctx, Math.round(stats[i]),
      sx + L.card.w * 0.038, L.card.y + L.card.h * 0.855,
      L.card.h * 0.100, BROWN, { stroke: CREAM, strokeW: Math.max(1.2, L.card.h * 0.016) });
  }

  // 四个功能按钮
  if (!image(ctx, engine, en ? FILE.actionsClean : FILE.actions,
    L.act.x, L.act.y, L.act.w, L.act.h)) fbActions(ctx, L);
  if (en) {
    for (i = 0; i < 4; i++) {
      var ab = L.actionBtns[i];
      ink(ctx, I.t('nestAct' + i), ab.x + ab.w / 2, ab.y + ab.h * 0.74,
        ab.h * 0.28, '#FFFDF6', { stroke: 'rgba(120,62,30,0.88)', strokeW: Math.max(2, ab.h * 0.075) });
    }
  }

  // 底部导航
  if (!image(ctx, engine, en ? FILE.navbarClean : FILE.navbar,
    L.nav.x, L.nav.y, L.nav.w, L.nav.h)) fbNav(ctx, L);
  if (en) {
    for (i = 0; i < 4; i++) {
      ink(ctx, I.t('nestTab' + i), L.W * NAV_X[i], L.nav.y + L.nav.h * 0.845,
        L.nav.h * 0.185, BROWN, { stroke: 'rgba(255,250,238,0.9)', strokeW: 2 });
    }
  }

  return L;
}

module.exports = {
  P: P, FILE: FILE, ALL: ALL, R: R,
  layout: layout,
  paint: paint,
  image: image,
  imageAt: imageAt,
  spriteAt: spriteAt,
  ink: ink
};
