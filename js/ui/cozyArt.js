/**
 * 连连看关卡界面 · 真实分层美术绘制层
 *
 * 素材来自用户提供的 13 张分层图（见 .workbuddy/build_cozy_assets.py）：
 *   bg.jpg / frame.png / house.png / cat_lie.png / pillow.png
 *   title.png / label.png / btn_back.png / btn_{hint,shuffle,bomb,time}[_clean].png
 * 已去除水印，并把会变化的文字（关卡号、剩余时间）从底板里抹掉，
 * 运行期由 embossText() 按 i18n 重绘；四个道具按钮文案固定，中文直接用原图美术字。
 * 棋子图案仍使用项目原有的 assets/textures/cats 与 icons 两张雪碧图。
 *
 * 所有函数返回 true/false：图片未加载时返回 false，调用方回退到 cozy.js 的纯 Canvas 绘制，
 * 保证首帧、无头冒烟测试与真机偶发加载失败都不会出现空白。
 */
var P = 'assets/textures/cozy/';

var FILE = {
  bg: 'bg.jpg',
  frame: 'frame.png',
  house: 'house.png',
  cat: 'cat_lie.png',
  pillow: 'pillow.png',
  title: 'title.png',
  label: 'label.png',
  back: 'btn_back.png',
  hint: 'btn_hint.png',
  shuffle: 'btn_shuffle.png',
  bomb: 'btn_bomb.png',
  time: 'btn_time.png',
  hintClean: 'btn_hint_clean.png',
  shuffleClean: 'btn_shuffle_clean.png',
  bombClean: 'btn_bomb_clean.png',
  timeClean: 'btn_time_clean.png'
};

/** 预加载清单（供 render.js preload 使用） */
var ALL = (function () {
  var a = [];
  for (var k in FILE) if (FILE.hasOwnProperty(k)) a.push(P + FILE[k]);
  return a;
})();

/** 画一张图到目标矩形；未就绪返回 false */
function image(ctx, engine, file, x, y, w, h) {
  if (!engine || !engine.img) return false;
  var im = engine.img(P + file);
  if (!im || !im.width) return false;
  try { ctx.drawImage(im, x, y, w, h); } catch (e) { return false; }
  return true;
}

/** 整屏奶油背景（按比例拉伸，保留原图爪印与闪光的位置） */
function paintBg(ctx, engine, W, H) {
  return image(ctx, engine, FILE.bg, 0, 0, W, H);
}

/** 奶油圆角棋盘外框 */
function frame(ctx, engine, x, y, w, h) {
  return image(ctx, engine, FILE.frame, x, y, w, h);
}

/** 装饰：猫窝 / 躺猫 / 抱枕 */
function decor(ctx, engine, name, x, y, w, h) {
  return image(ctx, engine, FILE[name], x, y, w, h);
}

/** 关卡标题胶囊底板（文字另行绘制） */
function titlePlate(ctx, engine, x, y, w, h) {
  return image(ctx, engine, FILE.title, x, y, w, h);
}

/** 右上「剩余步数 / 时间」底板（文字另行绘制） */
function labelPlate(ctx, engine, x, y, w, h) {
  return image(ctx, engine, FILE.label, x, y, w, h);
}

/** 返回按钮 */
function back(ctx, engine, x, y, w, h) {
  return image(ctx, engine, FILE.back, x, y, w, h);
}

/**
 * 道具按钮底板。
 * 中文界面用带美术字的原图（像素级还原参考图），英文界面用抹字版再叠英文字。
 */
function toolBtn(ctx, engine, key, x, y, w, h, en) {
  var map = {
    hint: [FILE.hint, FILE.hintClean],
    shuffle: [FILE.shuffle, FILE.shuffleClean],
    bomb: [FILE.bomb, FILE.bombClean],
    time: [FILE.time, FILE.timeClean]
  };
  var f = map[key];
  if (!f) return false;
  return image(ctx, engine, en ? f[1] : f[0], x, y, w, h);
}

/**
 * 奶油浮雕字：深棕外描边 + 奶白内描边 + 奶油填充 + 轻投影，
 * 与素材里「第8关 / 提示 / 剩余步数」的美术字保持同一观感。
 */
function embossText(ctx, text, cx, cy, size, opt) {
  opt = opt || {};
  var s = Math.max(6, Math.round(size));
  ctx.save();
  ctx.font = '900 ' + s + 'px "Microsoft YaHei","PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // 投影（单独画一次，避免描边也被染上阴影）
  ctx.shadowColor = 'rgba(122,58,24,0.36)';
  ctx.shadowBlur = s * 0.10;
  ctx.shadowOffsetY = s * 0.06;
  ctx.fillStyle = 'rgba(120,62,30,0.45)';
  ctx.fillText(String(text), cx + s * 0.02, cy + s * 0.04);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  var outer = opt.outline || '#A85A2B';
  var inner = opt.inner || '#FFF9EE';
  ctx.strokeStyle = outer;
  ctx.lineWidth = s * (opt.stroke || 0.17);
  ctx.strokeText(String(text), cx, cy);
  ctx.strokeStyle = inner;
  ctx.lineWidth = s * 0.065;
  ctx.strokeText(String(text), cx, cy);
  ctx.fillStyle = opt.fill || '#FFF6E2';
  ctx.fillText(String(text), cx, cy);
  ctx.restore();
}

/**
 * 小尺寸底板文字（信息标签 / 角标）：单层深棕描边 + 奶白填充。
 * 字号很小时多层浮雕会糊成一团，这里用最干净的两遍绘制。
 */
function plateText(ctx, text, cx, cy, size, opt) {
  opt = opt || {};
  var s = Math.max(6, Math.round(size));
  ctx.save();
  ctx.font = 'bold ' + s + 'px "Microsoft YaHei","PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = opt.outline || 'rgba(132,62,28,0.95)';
  ctx.lineWidth = Math.max(1.5, s * (opt.stroke || 0.19));
  ctx.strokeText(String(text), cx, cy);
  ctx.fillStyle = opt.fill || '#FFF8EA';
  ctx.fillText(String(text), cx, cy);
  ctx.restore();
}

/** 小号棕字（分数、按钮角标等） */
function smallText(ctx, text, cx, cy, size, color) {
  ctx.save();
  ctx.font = 'bold ' + Math.max(7, Math.round(size)) + 'px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.32);
  ctx.strokeStyle = 'rgba(255,248,232,0.9)';
  ctx.strokeText(String(text), cx, cy);
  ctx.fillStyle = color || '#9A5A30';
  ctx.fillText(String(text), cx, cy);
  ctx.restore();
}

/** 把秒数格式化成 02:15 */
function mmss(sec) {
  var n = Math.max(0, Math.ceil(sec || 0));
  var m = Math.floor(n / 60), s2 = n % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s2 < 10 ? '0' : '') + s2;
}

module.exports = {
  P: P, FILE: FILE, ALL: ALL,
  image: image,
  paintBg: paintBg,
  frame: frame,
  decor: decor,
  titlePlate: titlePlate,
  labelPlate: labelPlate,
  back: back,
  toolBtn: toolBtn,
  embossText: embossText,
  plateText: plateText,
  smallText: smallText,
  mmss: mmss
};
