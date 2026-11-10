/** 绘制辅助函数（全部基于设计逻辑坐标，由 engine 统一缩放） */
var A = require('../adapter.js');

var D = {};

D.roundRect = function (ctx, x, y, w, h, r) {
  if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
  ctx.lineTo(x + r.bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.arcTo(x, y, x + r.tl, y, r.tl);
  ctx.closePath();
};

/** 圆角按钮，返回 {x,y,w,h} 供点击判定 */
D.button = function (ctx, btn, t) {
  var pressed = btn._pressed;
  var scale = pressed ? 0.95 : 1;
  ctx.save();
  ctx.translate(btn.x + btn.w / 2, btn.y + btn.h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-btn.w / 2, -btn.h / 2);
  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  D.roundRect(ctx, 2, 4, btn.w, btn.h, btn.h / 2);
  ctx.fill();
  // 主体
  var g = ctx.createLinearGradient(0, 0, 0, btn.h);
  g.addColorStop(0, btn.color2 || btn.color);
  g.addColorStop(1, btn.color);
  ctx.fillStyle = g;
  D.roundRect(ctx, 0, 0, btn.w, btn.h, btn.h / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 文本
  ctx.fillStyle = btn.textColor || '#ffffff';
  ctx.font = 'bold ' + (btn.fontSize || btn.h * 0.42) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(btn.text, btn.w / 2, btn.h / 2 + 1);
  ctx.restore();
};

D.hit = function (btn, px, py) {
  return px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h;
};

/** 卡片式文字面板 */
D.panel = function (ctx, x, y, w, h, fill) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  D.roundRect(ctx, x + 3, y + 5, w, h, 18);
  ctx.fill();
  ctx.fillStyle = fill || 'rgba(255,255,255,0.92)';
  D.roundRect(ctx, x, y, w, h, 18);
  ctx.fill();
};

D.text = function (ctx, str, x, y, size, color, align, bold) {
  ctx.fillStyle = color || '#5a4a42';
  ctx.font = (bold === false ? '' : 'bold ') + size + 'px ' + D.FONT;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
};

/** 默认字体族（无衬线，正文用） */
D.FONT = 'sans-serif';
/** 圆体字族（logo / 标题用，iOS 上有「圆体-简」，安卓回退到系统黑体） */
D.FONT_ROUND = '"Yuanti SC", "YuanTi SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 估算文本宽度（不依赖 measureText，保证真机与预览一致） */
D.measure = function (str, size) {
  var w = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c >= 0x4E00 && c <= 0x9FFF) w += 1.0;          // 汉字
    else if (c >= 0x3000 && c <= 0x303F) w += 1.0;     // 全角标点
    else if (c === 32) w += 0.32;                       // 空格
    else if (c >= 48 && c <= 57) w += 0.58;             // 数字
    else if (c >= 65 && c <= 90) w += 0.66;             // 大写
    else if (c >= 97 && c <= 122) w += 0.55;            // 小写
    else w += 0.42;
  }
  return w * size;
};

/** 自动缩字号，保证不超过 maxW */
D.fit = function (str, size, maxW) {
  if (!maxW) return size;
  var w = D.measure(str, size);
  if (w <= maxW || w <= 0) return size;
  return Math.max(6, size * maxW / w);
};

/**
 * 贴纸风格文字（可带描边/外描边，支持自动缩字号、字族、字距）
 * opt: { align, stroke, strokeW, outer, outerW, maxW, bold, font, spacing, fill }
 *   font    字体族字符串（默认 D.FONT）
 *   spacing 字距（像素，正值拉开）；带字距时改为逐字绘制
 *   fill    false 表示只描边不填充（用来做贴纸厚度/投影层）
 */
D.label = function (ctx, str, x, y, size, color, opt) {
  opt = opt || {};
  var s = D.fit(str, size, opt.maxW);
  var font = (opt.bold === false ? '' : 'bold ') + s + 'px ' + (opt.font || D.FONT);
  ctx.font = font;
  ctx.textAlign = opt.align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // 无字距：一次画完
  if (!opt.spacing) {
    if (opt.outer && opt.outerW) {
      ctx.strokeStyle = opt.outer;
      ctx.lineWidth = opt.outerW;
      ctx.strokeText(str, x, y);
    }
    if (opt.stroke && opt.strokeW) {
      ctx.strokeStyle = opt.stroke;
      ctx.lineWidth = opt.strokeW;
      ctx.strokeText(str, x, y);
    }
    if (opt.fill !== false) {
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
    }
    return s;
  }

  // 有字距：逐字绘制，先算总宽再按 align 求起点
  var widths = [], total = 0, i;
  for (i = 0; i < str.length; i++) {
    var w = D.measure(str.charAt(i), s);
    widths.push(w);
    total += w;
  }
  total += opt.spacing * (str.length - 1);
  var cx0 = x;
  if ((opt.align || 'center') === 'center') cx0 = x - total / 2;
  else if (opt.align === 'right') cx0 = x - total;
  ctx.textAlign = 'left';
  var acc = cx0;
  for (i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    if (opt.outer && opt.outerW) {
      ctx.strokeStyle = opt.outer;
      ctx.lineWidth = opt.outerW;
      ctx.strokeText(ch, acc, y);
    }
    if (opt.stroke && opt.strokeW) {
      ctx.strokeStyle = opt.stroke;
      ctx.lineWidth = opt.strokeW;
      ctx.strokeText(ch, acc, y);
    }
    if (opt.fill !== false) {
      ctx.fillStyle = color;
      ctx.fillText(ch, acc, y);
    }
    acc += widths[i] + opt.spacing;
  }
  return s;
};

/** 橙色胶囊按钮（"去完成"），文字由调用方再画；r 不传时按胶囊（h/2）处理 */
D.pill = function (ctx, x, y, w, h, c1, c2, rim, r) {
  var rr = r === undefined ? h / 2 : r;
  ctx.fillStyle = rim || '#FFFFFF';
  D.roundRect(ctx, x - 3, y - 3, w + 6, h + 6, rr + 3); ctx.fill();
  var g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  D.roundRect(ctx, x, y, w, h, rr); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  D.roundRect(ctx, x + w * 0.14, y + h * 0.12, w * 0.72, h * 0.19, Math.min(rr * 0.55, h * 0.095)); ctx.fill();
};

/** 画一张图片（未就绪时静默跳过），返回是否画出 */
D.img = function (ctx, engine, path, x, y, w, h) {
  var im = engine.img(path);
  if (!im || !im.width) return false;
  try { ctx.drawImage(im, x, y, w, h); } catch (e) { return false; }
  return true;
};

/** 星星 */
D.star = function (ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var ang = -Math.PI / 2 + i * Math.PI / 5;
    var rr = i % 2 === 0 ? r : r * 0.45;
    var px = x + Math.cos(ang) * rr;
    var py = y + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
};

/** 猫爪印（用于连线轨迹 / 背景装饰）—— 纯坐标运算，不依赖 ctx 变换 */
D.paw = function (ctx, x, y, r, color, rot) {
  var a = rot || 0, ca = Math.cos(a), sa = Math.sin(a);
  ctx.fillStyle = color;
  var blob = function (px, py, rx, ry) {
    var ax = x + px * ca - py * sa, ay = y + px * sa + py * ca;
    ctx.beginPath();
    ctx.ellipse(ax, ay, rx, ry, a, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(0, r * 0.25, r * 0.75, r * 0.60);            // 掌垫
  for (var i = -1; i <= 1; i++) blob(i * r * 0.55, -r * 0.55, r * 0.28, r * 0.36);
  blob(-r * 0.95, -r * 0.15, r * 0.22, r * 0.30);
  blob(r * 0.95, -r * 0.15, r * 0.22, r * 0.30);
};

/**
 * 简笔猫脸：雪碧图未就绪时的兜底绘制
 * 保证棋盘上看到的是"猫脸"而不是爪印，且不同 id 有不同毛色便于配对
 * @param hue 0..360 毛色色相
 */
D.catFace = function (ctx, x, y, r, hue) {
  var fur = 'hsl(' + hue + ', 60%, 80%)';
  var ear = 'hsl(' + hue + ', 52%, 66%)';
  var line = 'hsl(' + hue + ', 40%, 40%)';
  ctx.save();
  ctx.translate(x, y);
  // 耳朵
  ctx.fillStyle = ear;
  ctx.beginPath();
  ctx.moveTo(-r * 0.70, -r * 0.30); ctx.lineTo(-r * 0.88, -r * 0.92); ctx.lineTo(-r * 0.22, -r * 0.62);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.70, -r * 0.30); ctx.lineTo(r * 0.88, -r * 0.92); ctx.lineTo(r * 0.22, -r * 0.62);
  ctx.closePath(); ctx.fill();
  // 脸
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.86, r * 0.76, 0, 0, Math.PI * 2);
  ctx.fill();
  // 眼睛
  ctx.fillStyle = line;
  ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.06, r * 0.09, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.32, -r * 0.06, r * 0.09, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  // 鼻子
  ctx.fillStyle = '#e08a90';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.20); ctx.lineTo(-r * 0.09, r * 0.10); ctx.lineTo(r * 0.09, r * 0.10);
  ctx.closePath(); ctx.fill();
  // 嘴
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath(); ctx.moveTo(0, r * 0.20); ctx.quadraticCurveTo(-r * 0.16, r * 0.36, -r * 0.28, r * 0.22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, r * 0.20); ctx.quadraticCurveTo(r * 0.16, r * 0.36, r * 0.28, r * 0.22); ctx.stroke();
  // 胡须
  ctx.lineWidth = Math.max(0.8, r * 0.035);
  for (var s = -1; s <= 1; s += 2) {
    for (var k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.32, r * 0.12 + k * r * 0.14);
      ctx.lineTo(s * r * 0.96, r * 0.02 + k * r * 0.24);
      ctx.stroke();
    }
  }
  ctx.restore();
};

module.exports = D;
