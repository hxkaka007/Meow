/**
 * 猫咪可动部件渲染层（眼睛 / 鼻子 / 嘴巴 / 身体）
 *
 * 素材：每只猫都有两张图 —— 原始立绘 + 由 .workbuddy/build_cat_rig.py 生成的
 * clean 底图（五官被补毛擦掉，并烘焙了闭眼弧线 / 闭嘴弧线）。
 * 运行期不依赖任何切割好的小图：把原图在离屏画布里用羽化椭圆遮罩「抠」出
 * 眼睛 / 鼻子 / 嘴巴四个小片，再对每片做独立的缩放、位移、旋转叠回底图上。
 * 这样 25 个品种立绘 + cat_atlas.png 的 24 个猫头帧都共用同一套动画逻辑，
 * 且 cats/cat_atlas.png 本体从未被改动（heads_clean.png 是另存的派生副本）。
 *
 * 动画全部由时间 t 和每只猫的 seed 推导，无状态、可重入：
 *   身体 呼吸起伏 + 左右轻摆 + 点击弹跳
 *   眼睛 定时眨眼（偶发连眨）+ 视线游移 + 开心眯眼
 *   鼻子 嗅动（缩放 / 轻摆）+ 喵叫时微皱
 *   嘴巴 定时喵叫张合 + 开心微笑
 *
 * 兜底：离屏画布 / clean 底图不可用时，退回「原图 + 整体呼吸」，
 * 不会出现半张脸或白屏（Node 冒烟脚本也走这条路径）。
 */
var RigData = require('../core/breedRig.js');
var SPRITES = require('../core/sprites.js');

var TAU = Math.PI * 2;
var _offs = {};          // 尺寸 -> {canvas, ctx}，整猫 / 猫头各一张，全程复用
var _off = null, _octx = null;

/**
 * 懒创建并缓存离屏画布（微信小游戏 wx.createCanvas / 浏览器 canvas）。
 * 同一帧里大猫用 300x330、头像用 176x177，缓存后不会每帧新建两次画布。
 */
function offscreen(w, h) {
  var key = w + 'x' + h;
  var ent = _offs[key];
  if (ent) { _off = ent.c; _octx = ent.x; return true; }
  var c = null;
  try {
    if (typeof wx !== 'undefined' && wx.createCanvas) c = wx.createCanvas();
    else if (typeof document !== 'undefined' && document.createElement)
      c = document.createElement('canvas');
  } catch (e) { return false; }
  if (!c || !c.getContext) return false;
  try {
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    var x = c.getContext('2d');
    if (!x) return false;
    _offs[key] = { c: c, x: x };
    _off = c; _octx = x;
  } catch (e) { return false; }
  return true;
}

function imOf(engine, path) {
  if (!engine || !engine.img || !path) return null;
  var im = engine.img(path);
  return im && im.width ? im : null;
}

/** 椭圆羽化遮罩：中心 86% 完全不透明，外圈渐隐，正好盖住 clean 底图的擦除区 */
function feather(octx, cx, cy, rx, ry) {
  octx.save();
  octx.globalCompositeOperation = 'destination-in';
  if (octx.globalCompositeOperation !== 'destination-in') { octx.restore(); return false; }
  octx.translate(cx, cy);
  octx.scale(1, ry / rx);
  var g = octx.createRadialGradient(0, 0, rx * 0.86, 0, 0, rx);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  octx.fillStyle = g;
  octx.beginPath();
  octx.arc(0, 0, rx, 0, TAU);
  octx.fill();
  octx.restore();
  return true;
}

/**
 * 抠出一个五官小片并变换绘制。
 * @param part {cx,cy,rx,ry,rect?} 源图裁片内像素坐标
 * @param tf   {sx,sy,dx,dy,rot,alpha} 目标画布像素 / 弧度
 */
function paintPart(ctx, im, S, part, tf, box) {
  var octx = _octx, off = _off;
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.globalCompositeOperation = 'source-over';
  octx.globalAlpha = 1;
  octx.clearRect(0, 0, S.sw, S.sh);
  octx.save();
  if (part.rect) {
    octx.beginPath();
    octx.rect(part.rect[0], part.rect[1], part.rect[2], part.rect[3]);
    octx.clip();
  }
  try { octx.drawImage(im, S.sx, S.sy, S.sw, S.sh, 0, 0, S.sw, S.sh); }
  catch (e) { octx.restore(); return; }
  octx.restore();
  if (!feather(octx, part.cx, part.cy, part.rx, part.ry)) return;

  var dcx = box.x + part.cx / S.sw * box.w;
  var dcy = box.y + part.cy / S.sh * box.h;
  ctx.save();
  if (tf.alpha !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, tf.alpha));
  ctx.translate(dcx + (tf.dx || 0), dcy + (tf.dy || 0));
  if (tf.rot) ctx.rotate(tf.rot);
  ctx.scale(tf.sx === undefined ? 1 : tf.sx, tf.sy === undefined ? 1 : tf.sy);
  ctx.translate(-dcx, -dcy);
  try { ctx.drawImage(off, 0, 0, S.sw, S.sh, box.x, box.y, box.w, box.h); } catch (e) { }
  ctx.restore();
}

/** 时间驱动的动画相位（确定性，无状态；seed 让每只猫错开节奏） */
function phases(t, seed, forced) {
  var s = Math.abs(seed | 0) % 97;
  var blinkP = 3.4 + (s % 7) * 0.34;
  var bp = (t + s * 0.73) % blinkP;
  var blink = bp < 0.26 ? Math.sin(Math.PI * bp / 0.26) : 0;
  // 三分之一的猫偶尔连眨两下
  if (s % 3 === 0 && bp > 0.34 && bp < 0.58)
    blink = Math.max(blink, Math.sin(Math.PI * (bp - 0.34) / 0.24) * 0.85);
  var meowP = 7.2 + (s % 5) * 1.35;
  var mp = (t + s * 1.37) % meowP;
  var meow = mp < 0.55 ? Math.sin(Math.PI * mp / 0.55) : 0;
  var sniffP = 2.7 + (s % 4) * 0.47;
  var sp = (t + s * 2.11) % sniffP;
  var sniff = sp < 0.48 ? Math.sin(Math.PI * sp / 0.48) : 0;
  var breathe = Math.sin(t * 1.65 + s);
  var sway = Math.sin(t * 0.83 + s * 1.3);
  var gaze = Math.sin(t * 0.61 + s * 0.9);

  var p = {
    blink: blink, meow: meow, sniff: sniff,
    breathe: breathe, sway: sway, gaze: gaze, happy: 0
  };
  // 摆拍 / 自动验证用：预览页可注入 window.__RIG_POSE
  var f = forced;
  if (!f && typeof window !== 'undefined') f = window.__RIG_POSE;
  if (f) {
    for (var k in p) if (f[k] !== undefined && f.hasOwnProperty(k)) p[k] = +f[k] || 0;
  }
  return p;
}

/**
 * 画一只会动的猫。
 * o = {
 *   source:{path,sx,sy,sw,sh}, clean:{path,sx,sy,sw,sh}, anchors:{...},
 *   x,y,w,h, t, seed, mode:'full'|'light'|'head', happy?, pose?
 * }
 */
function paint(ctx, engine, o) {
  var im = imOf(engine, o.source.path);
  if (!im) return false;
  var S = o.source, C = o.clean, A = o.anchors;
  var box = { x: o.x, y: o.y, w: o.w, h: o.h };
  var t = o.t || 0, seed = o.seed || 0;
  var p = phases(t, seed, o.pose);
  var happy = Math.max(0, Math.min(1, o.happy || 0));
  p.happy = Math.max(p.happy, happy);
  var head = o.mode === 'head';
  var light = o.mode === 'light';
  var k = box.w / S.sw;   // 源图像素 -> 目标画布像素

  var breathAmp = head ? 0.008 : 0.014;
  var bsx = 1 + breathAmp * p.breathe;
  var bsy = 1 - breathAmp * 1.18 * p.breathe - 0.045 * p.happy;
  var rot = (head ? 0.006 : 0.010) * p.sway;
  var dx = (head ? 0.7 : 1.8) * p.sway * k;
  var dy = -(head ? 4 : 12) * p.happy * k;

  ctx.save();
  ctx.translate(box.x + box.w / 2 + dx, box.y + box.h + dy);
  ctx.scale(bsx, bsy);
  if (rot) ctx.rotate(rot);
  ctx.translate(-(box.x + box.w / 2), -(box.y + box.h));

  var cim = C ? imOf(engine, C.path) : null;
  var canPart = !!(cim && offscreen(S.sw, S.sh));
  if (!canPart) {
    try { ctx.drawImage(im, S.sx, S.sy, S.sw, S.sh, box.x, box.y, box.w, box.h); }
    catch (e) { ctx.restore(); return false; }
    ctx.restore();
    return true;
  }

  // 底图：擦掉五官 + 烘焙闭眼 / 闭嘴弧线
  try { ctx.drawImage(cim, C.sx, C.sy, C.sw, C.sh, box.x, box.y, box.w, box.h); }
  catch (e) { ctx.restore(); return false; }

  var sw = S.sw, sh = S.sh;
  var gap = A.gap * sw;                 // 眼距（源图像素）
  var f = function (v, i) { return v[i] * (i ? sh : sw); };
  var eL = [f(A.eyeL, 0), f(A.eyeL, 1)];
  var eR = [f(A.eyeR, 0), f(A.eyeR, 1)];
  var nose = [f(A.nose, 0), f(A.nose, 1)];
  var mouth = [f(A.mouth, 0), f(A.mouth, 1)];
  var midX = (eL[0] + eR[0]) / 2;
  var eyeCy = (eL[1] + eR[1]) / 2 + 0.030 * gap;
  // 与 build_cat_rig.py 的擦除椭圆对齐：部件不透明核心 0.86*r 恰好 = 擦除半径
  var mul = A.eyeMul || 1;
  var erx = 0.46 * gap * mul, ery = 0.415 * gap * mul;

  var eyeSy = 1 - 0.93 * p.blink - 0.16 * p.happy;
  var eyeAlpha = 1 - 0.96 * p.blink;
  var eyeDx = 1.15 * p.gaze * k;
  var eyeTf = { sx: 1, sy: Math.max(0.04, eyeSy), dx: eyeDx, dy: 0, alpha: eyeAlpha };

  if (light) {
    // 领养列表缩略图：把鼻子+嘴巴合成一个静止小片，省掉两次离屏合成
    var mz = {
      cx: midX, cy: (nose[1] + mouth[1]) / 2,
      rx: 0.36 * gap * mul, ry: 0.34 * gap * mul,
      rect: [midX - 0.36 * gap * mul, eyeCy + ery * 0.5,
             0.72 * gap * mul, sh]
    };
    paintPart(ctx, im, S, mz, { sx: 1, sy: 1 }, box);
  } else {
    // 嘴巴：喵叫 / 开心时纵向拉伸并下移。插画猫头的口鼻是平面色块，
    // 拉伸幅度比 3D 立绘小一些，避免拉出一块白色鼓包。
    var mSy = 1 + (head ? 0.34 : 0.58) * p.meow + 0.16 * p.happy;
    var mouthPart = {
      cx: mouth[0], cy: mouth[1],
      rx: 0.337 * gap * mul, ry: 0.203 * gap * mul,
      rect: [mouth[0] - 0.34 * gap * mul, nose[1] + 1,
             0.68 * gap * mul, sh - nose[1] - 1]
    };
    paintPart(ctx, im, S, mouthPart, {
      sx: 1 - 0.05 * p.meow, sy: mSy, dy: 2.6 * p.meow * k
    }, box);

    // 鼻子：嗅动 + 喵叫时轻皱
    var nosePart = {
      cx: nose[0], cy: nose[1],
      rx: 0.192 * gap * mul, ry: 0.157 * gap * mul,
      rect: [nose[0] - 0.20 * gap * mul, eyeCy,
             0.40 * gap * mul, mouth[1] - eyeCy - 1]
    };
    paintPart(ctx, im, S, nosePart, {
      sx: 1 + 0.11 * p.sniff + 0.05 * p.meow,
      sy: 1 - 0.07 * p.sniff,
      dy: (1.6 * p.sniff + 1.0 * p.meow) * k,
      rot: 0.035 * Math.sin(t * 2.1 + seed)
    }, box);

    // 张嘴时补一点口腔暗部，让「喵」更明显
    if (p.meow > 0.2) {
      ctx.save();
      ctx.globalAlpha = (head ? 0.46 : 0.30) * p.meow;
      ctx.fillStyle = '#5A2A22';
      var mcx = box.x + mouth[0] / sw * box.w;
      var mcy = box.y + (mouth[1] + 2.6 * p.meow) / sh * box.h;
      var mrw = 0.085 * gap * k * (1 + 0.3 * p.meow);
      var mrh = 0.055 * gap * k * (0.5 + p.meow);
      ctx.translate(mcx, mcy);
      ctx.scale(mrw, mrh);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  // 眼睛：最后画，避免被鼻子/嘴巴小片盖住
  var eyeLPart = {
    cx: eL[0], cy: eyeCy, rx: erx, ry: ery,
    rect: [0, 0, midX, sh]
  };
  var eyeRPart = {
    cx: eR[0], cy: eyeCy, rx: erx, ry: ery,
    rect: [midX, 0, sw - midX, sh]
  };
  paintPart(ctx, im, S, eyeLPart, eyeTf, box);
  paintPart(ctx, im, S, eyeRPart, eyeTf, box);

  ctx.restore();
  return true;
}

/** 品种整猫立绘 -> paint 参数 */
function breedOpts(engine, artPath, x, y, w, h, o) {
  var A = RigData.breedOf(artPath);
  if (!A) return null;
  var im = imOf(engine, artPath);
  var sw = im ? im.width : 300, sh = im ? im.height : 330;
  o = o || {};
  return {
    source: { path: artPath, sx: 0, sy: 0, sw: sw, sh: sh },
    clean: { path: A.clean, sx: 0, sy: 0, sw: sw, sh: sh },
    anchors: A, x: x, y: y, w: w, h: h,
    t: o.t, seed: o.seed, happy: o.happy, pose: o.pose,
    mode: o.mode || 'full'
  };
}

/** cat_atlas.png 的猫头帧 -> paint 参数（信息卡圆形头像用） */
function headOpts(engine, frame, x, y, w, h, o) {
  var rc = SPRITES.rect('cat', frame);
  var A = RigData.headOf(frame);
  if (!rc || !A) return null;
  var atlas = SPRITES.atlases.cat.path;
  o = o || {};
  return {
    source: { path: atlas, sx: rc.sx, sy: rc.sy, sw: rc.sw, sh: rc.sh },
    clean: { path: RigData.DATA.headClean, sx: rc.sx, sy: rc.sy, sw: rc.sw, sh: rc.sh },
    anchors: A, x: x, y: y, w: w, h: h,
    t: o.t, seed: 40 + (frame | 0), happy: o.happy, pose: o.pose,
    mode: 'head'
  };
}

/** 稳定 seed：同一只猫每次进入都保持自己的节奏 */
function seedOf(str) {
  var s = 0;
  str = String(str || 'cat');
  for (var i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(s);
}

module.exports = {
  paint: paint,
  phases: phases,
  breedOpts: breedOpts,
  headOpts: headOpts,
  seedOf: seedOf,
  DATA: RigData
};
