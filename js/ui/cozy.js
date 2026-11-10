/**
 * 奶油毛绒风格 UI（连连看关卡界面专用）
 *
 * 设计参照：奶油橘粉渐变底 + 橙棕描边圆角外框 + 立体奶白面板 +
 * 白色圆角棋子卡 + 毛绒猫窝/毛线球装饰 + 软糖色圆角方形道具按钮。
 *
 * 全部为纯 Canvas 绘制（不依赖新图片资源），按比例自适应任意屏幕尺寸，
 * 微信小游戏与浏览器预览均可直接用。
 */
var D = require('./draw.js');

/** 稳定伪随机：同一个 i 恒返回同一个值，保证绒点每帧不闪 */
function rnd(i) {
  var x = Math.sin(i * 127.1 + 31.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 线性渐变（兼容无渐变环境） */
function vgrad(ctx, y0, y1, c0, c1, c2) {
  try {
    var g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c0);
    if (c2) g.addColorStop(0.55, c2);
    g.addColorStop(1, c1);
    return g;
  } catch (e) { return c0; }
}

var C = {};

C.PALETTE = {
  creamTop: '#FFF8EF',
  creamMid: '#FDEBDD',
  creamBottom: '#FCE0CC',
  rim: '#EFA863',
  rimSoft: '#F7C58C',
  panelTop: '#FFFDF8',
  panelBottom: '#FFF0DF',
  line: '#EFC6A0',
  lineSoft: '#F6DFC6',
  ink: '#8A5A3B',
  inkDeep: '#A45B2C',
  title: '#B96A33',
  orange: '#FFC77C',
  orangeDeep: '#F2934A',
  mint: '#7FD8B4',
  mintLight: '#B4EBD2',
  shadow: 'rgba(176,108,62,0.20)'
};

/** 全屏背景：桃粉奶油渐变 + 柔光 + 细绒点 + 橙色圆角外框 */
C.paintBg = function (ctx, W, H) {
  var P = C.PALETTE;
  ctx.save();
  // 渐变底（多铺一些，防止震屏露边）
  var g = vgrad(ctx, -10, H + 10, P.creamTop, P.creamBottom, P.creamMid);
  ctx.fillStyle = g;
  ctx.fillRect(-12, -12, W + 24, H + 24);

  // 中心柔光
  try {
    var rg = ctx.createRadialGradient(W * 0.5, H * 0.38, W * 0.06,
      W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
    rg.addColorStop(0, 'rgba(255,255,255,0.55)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0.08)');
    rg.addColorStop(1, 'rgba(240,158,96,0.16)');
    ctx.fillStyle = rg;
    ctx.fillRect(-12, -12, W + 24, H + 24);
  } catch (e) { }

  // 极淡的绒毛颗粒，模拟毛绒纸纹
  ctx.fillStyle = 'rgba(214,158,112,0.10)';
  for (var i = 0; i < 150; i++) {
    var px = rnd(i * 3 + 1) * W, py = rnd(i * 3 + 2) * H;
    var rr = 0.5 + rnd(i * 3 + 3) * 1.1;
    ctx.beginPath();
    ctx.arc(px, py, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  // 外框：橙棕描边 + 内侧白高光
  var m = Math.max(5, W * 0.014), r = Math.max(20, W * 0.072);
  ctx.strokeStyle = 'rgba(224,150,86,0.35)';
  ctx.lineWidth = 5;
  D.roundRect(ctx, m + 1, m + 3, W - m * 2 - 2, H - m * 2 - 2, r);
  ctx.stroke();
  ctx.strokeStyle = P.rim;
  ctx.lineWidth = 3;
  D.roundRect(ctx, m, m, W - m * 2, H - m * 2, r);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.2;
  D.roundRect(ctx, m + 3, m + 3, W - m * 2 - 6, H - m * 2 - 6, r - 3);
  ctx.stroke();
  ctx.restore();
};

/**
 * 奶油立体面板 / 棋盘外框
 * opt: { fillTop, fillBottom, rim, radius, shadow }
 */
C.plate = function (ctx, x, y, w, h, r, opt) {
  opt = opt || {};
  var P = C.PALETTE;
  ctx.save();
  // 底部柔和阴影
  ctx.fillStyle = P.shadow;
  D.roundRect(ctx, x + 2, y + 6, w, h, r);
  ctx.fill();
  // 橙色外圈
  ctx.fillStyle = opt.rim || P.rimSoft;
  D.roundRect(ctx, x - 2.5, y - 2.5, w + 5, h + 5, r + 2.5);
  ctx.fill();
  // 主体渐变
  ctx.fillStyle = vgrad(ctx, y, y + h,
    opt.fillTop || P.panelTop, opt.fillBottom || P.panelBottom);
  D.roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  // 内描边与顶部高光
  ctx.strokeStyle = 'rgba(232,168,112,0.35)';
  ctx.lineWidth = 1;
  D.roundRect(ctx, x + 2.5, y + 2.5, w - 5, h - 5, r - 2.5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  D.roundRect(ctx, x + w * 0.06, y + 3, w * 0.88, Math.max(2, h * 0.035), h * 0.02);
  ctx.fill();
  ctx.restore();
};

/** 白色棋子卡片（带浅棕细边、底部阴影、顶部高光） */
C.tileCard = function (ctx, x, y, w, h, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(188,130,84,0.28)';
  D.roundRect(ctx, x, y + 2.4, w, h, r);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, y, y + h, '#FFFFFF', '#FFF9EF');
  D.roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(224,178,134,0.95)';
  ctx.lineWidth = 1.3;
  D.roundRect(ctx, x + 0.6, y + 0.6, w - 1.2, h - 1.2, r - 0.6);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  D.roundRect(ctx, x + w * 0.14, y + 1.5, w * 0.72, Math.max(1.2, h * 0.04), h * 0.02);
  ctx.fill();
  ctx.restore();
};

/** 空格：浅奶油凹陷 */
C.tileEmpty = function (ctx, x, y, w, h, r) {
  ctx.fillStyle = 'rgba(238,205,170,0.34)';
  D.roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  D.roundRect(ctx, x + 1, y + 1, w - 2, h - 2, r - 1);
  ctx.stroke();
};

/** 橙色圆形返回按钮（含白色箭头） */
C.backCircle = function (ctx, cx, cy, r) {
  var P = C.PALETTE;
  ctx.save();
  ctx.fillStyle = 'rgba(184,104,52,0.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 2.5, r, r, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
  try {
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.12, cx, cy, r * 1.15);
    g.addColorStop(0, '#FFDAA2');
    g.addColorStop(0.55, '#FFBE79');
    g.addColorStop(1, P.orangeDeep);
    ctx.fillStyle = g;
  } catch (e) { ctx.fillStyle = P.orange; }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke();
  // 左上角高光
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.28, cy - r * 0.42, r * 0.45, r * 0.22, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // 白色箭头
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(2.4, r * 0.15);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.42, cy);
  ctx.lineTo(cx - r * 0.42, cy);
  ctx.moveTo(cx - r * 0.10, cy - r * 0.33);
  ctx.lineTo(cx - r * 0.42, cy);
  ctx.lineTo(cx - r * 0.10, cy + r * 0.33);
  ctx.stroke();
  ctx.restore();
};

/** 右上深棕小游戏菜单胶囊（三点 + 圆环） */
C.menuPill = function (ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(150,96,64,0.22)';
  D.roundRect(ctx, x + 1, y + 3, w, h, h / 2); ctx.fill();
  ctx.fillStyle = vgrad(ctx, y, y + h, '#63514A', '#3E322E');
  D.roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  D.roundRect(ctx, x + 1, y + 1, w - 2, h - 2, h / 2 - 1); ctx.stroke();
  var cy = y + h / 2, r = Math.max(1.5, h * 0.075);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (var i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + w * 0.26 + i * w * 0.115, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 右侧圆环
  var rx = x + w * 0.78, rr = h * 0.26;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = Math.max(1.5, h * 0.06);
  ctx.beginPath(); ctx.arc(rx, cy, rr, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(rx, cy, rr * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

/** 立体橘棕标题（圆体 + 白描边 + 淡棕阴影） */
C.title = function (ctx, str, cx, cy, size) {
  D.label(ctx, str, cx, cy + 2, size, 'rgba(160,96,52,0.22)', {
    font: D.FONT_ROUND, maxW: size * 5.4, fill: true
  });
  D.label(ctx, str, cx, cy, size, C.PALETTE.title, {
    font: D.FONT_ROUND, stroke: '#FFFDF6', strokeW: Math.max(3, size * 0.20),
    outer: 'rgba(226,154,92,0.55)', outerW: Math.max(5, size * 0.30),
    spacing: size * 0.02, maxW: size * 5.4
  });
};

/** 薄荷绿进度条 */
C.progress = function (ctx, x, y, w, h, ratio) {
  ratio = Math.max(0, Math.min(1, ratio || 0));
  ctx.save();
  ctx.fillStyle = '#F8E3C9';
  D.roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(233,182,132,0.65)';
  ctx.lineWidth = 1;
  D.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, h / 2 - 0.5); ctx.stroke();
  var fw = Math.max(h, w * ratio);
  ctx.fillStyle = vgrad(ctx, y, y + h, C.PALETTE.mintLight, C.PALETTE.mint);
  D.roundRect(ctx, x, y, fw, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  D.roundRect(ctx, x + 1, y + 1, fw - 2, h - 2, h / 2 - 1); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  D.roundRect(ctx, x + h * 0.35, y + h * 0.16, Math.max(0, fw - h * 0.7), h * 0.22, h * 0.11);
  ctx.fill();
  ctx.restore();
};

/** 浅橙「剩余时间 / 剩余步数」胶囊 */
C.timePill = function (ctx, x, y, w, h, text) {
  ctx.save();
  ctx.fillStyle = 'rgba(190,120,70,0.20)';
  D.roundRect(ctx, x + 1, y + 3, w, h, h / 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  D.roundRect(ctx, x - 2, y - 2, w + 4, h + 4, h / 2 + 2); ctx.fill();
  ctx.fillStyle = vgrad(ctx, y, y + h, '#FFF0D6', '#FFDCAE');
  D.roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(232,170,106,0.75)';
  ctx.lineWidth = 1.2;
  D.roundRect(ctx, x + 0.6, y + 0.6, w - 1.2, h - 1.2, h / 2 - 0.6); ctx.stroke();
  D.label(ctx, text, x + w / 2, y + h * 0.53, h * 0.46, '#A9662F', {
    font: D.FONT_ROUND, maxW: w * 0.88
  });
  ctx.restore();
};

/** 软糖色圆角方形道具按钮（白边 + 渐变 + 顶部高光 + 阴影） */
C.toolBtn = function (ctx, x, y, w, h, c1, c2, edge) {
  var r = Math.min(w, h) * 0.24;
  ctx.save();
  ctx.fillStyle = 'rgba(180,112,66,0.20)';
  D.roundRect(ctx, x + 2, y + 5, w, h, r); ctx.fill();
  ctx.fillStyle = '#FFFDF7';
  D.roundRect(ctx, x - 3, y - 3, w + 6, h + 6, r + 3); ctx.fill();
  ctx.fillStyle = vgrad(ctx, y, y + h, c1, c2);
  D.roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = edge || 'rgba(230,176,124,0.85)';
  ctx.lineWidth = 1.4;
  D.roundRect(ctx, x + 0.7, y + 0.7, w - 1.4, h - 1.4, r - 0.7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  D.roundRect(ctx, x + w * 0.13, y + h * 0.07, w * 0.74, h * 0.14, h * 0.06); ctx.fill();
  ctx.restore();
};

/** 右上角数量角标 */
C.badge = function (ctx, cx, cy, r, cnt) {
  ctx.save();
  ctx.fillStyle = '#FFFDF7';
  ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cnt > 0 ? '#FF6B4A' : '#A9A096';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold ' + (r * 1.25) + 'px ' + D.FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(cnt), cx, cy + 0.5);
  ctx.restore();
};

/** 毛线球（猫窝旁边的小道具） */
C.yarn = function (ctx, cx, cy, r, opt) {
  opt = opt || {};
  var base = opt.color || '#E8A55C';
  ctx.save();
  ctx.fillStyle = 'rgba(166,102,56,0.20)';
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.82, r * 0.95, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  try {
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
    g.addColorStop(0, '#FFE0AF');
    g.addColorStop(1, base);
    ctx.fillStyle = g;
  } catch (e) { ctx.fillStyle = base; }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // 缠绕线：两组旋转的细椭圆，形成毛线交叉纹
  ctx.strokeStyle = 'rgba(146,82,40,0.48)';
  ctx.lineWidth = Math.max(0.9, r * 0.10);
  for (var i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.92, r * 0.33, 0.42 + i * 0.32, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(146,82,40,0.30)';
  for (var j = 0; j < 3; j++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.92, r * 0.33, -0.42 + j * 0.42, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(0.7, r * 0.06);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, Math.PI * 1.05, Math.PI * 1.72); ctx.stroke();
  // 线头
  ctx.strokeStyle = base;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.85, cy + r * 0.45);
  ctx.quadraticCurveTo(cx + r * 1.5, cy + r * 0.75, cx + r * 1.35, cy + r * 1.25);
  ctx.stroke();
  ctx.restore();
};

/**
 * 毛绒猫窝：拱形外壳 + 两只猫耳 + 深橙洞口 + 绒毛描边
 * opt: { flip: 是否水平镜像, yarn: 是否带毛线球, tone: 0..1 色差 }
 */
C.catHouse = function (ctx, x, y, w, h, opt) {
  opt = opt || {};
  var P = C.PALETTE;
  ctx.save();
  ctx.translate(x, y);
  if (opt.flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }

  // 地面垫子与投影
  ctx.fillStyle = 'rgba(214,146,86,0.16)';
  ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.98, w * 0.56, h * 0.10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F2CE9B';
  ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.96, w * 0.50, h * 0.075, 0, 0, Math.PI * 2); ctx.fill();

  var arch = function (l, t, rw, bh) {
    ctx.beginPath();
    ctx.moveTo(l, bh);
    ctx.lineTo(l, t + h * 0.42);
    ctx.bezierCurveTo(l, t + h * 0.06, l + rw * 0.22, t, l + rw * 0.5, t);
    ctx.bezierCurveTo(l + rw * 0.78, t, l + rw, t + h * 0.06, l + rw, t + h * 0.42);
    ctx.lineTo(l + rw, bh);
    ctx.closePath();
  };

  // 两只猫耳（先画，被主体压住底部）
  function ear(ex, ey, ew, eh) {
    ctx.beginPath();
    ctx.moveTo(ex - ew / 2, ey + eh * 0.55);
    ctx.quadraticCurveTo(ex - ew * 0.46, ey - eh * 0.48, ex, ey - eh * 0.62);
    ctx.quadraticCurveTo(ex + ew * 0.46, ey - eh * 0.48, ex + ew / 2, ey + eh * 0.55);
    ctx.closePath();
    ctx.fillStyle = '#F7DDBB'; ctx.fill();
    ctx.strokeStyle = 'rgba(226,174,124,0.8)'; ctx.lineWidth = Math.max(1, w * 0.008); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex - ew * 0.25, ey + eh * 0.38);
    ctx.quadraticCurveTo(ex - ew * 0.22, ey - eh * 0.16, ex, ey - eh * 0.30);
    ctx.quadraticCurveTo(ex + ew * 0.22, ey - eh * 0.16, ex + ew * 0.25, ey + eh * 0.38);
    ctx.closePath();
    ctx.fillStyle = 'rgba(238,158,148,0.85)'; ctx.fill();
  }
  ear(w * 0.20, h * 0.10, w * 0.24, h * 0.30);
  ear(w * 0.80, h * 0.10, w * 0.24, h * 0.30);

  // 外壳：先铺一圈奶白毛绒外轮廓，再填立体渐变（与背景拉开层次）
  arch(0, h * 0.035, w, h);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#FFF2DC';
  ctx.lineWidth = Math.max(3.5, w * 0.042);
  ctx.stroke();
  ctx.fillStyle = vgrad(ctx, 0, h, '#FFFAF2', '#E9BB8C', '#FDE7C9');
  ctx.fill();
  ctx.strokeStyle = 'rgba(214,150,98,0.90)';
  ctx.lineWidth = Math.max(1.2, w * 0.012);
  ctx.stroke();

  // 外壳绒毛颗粒（白绒 + 少量暖色绒，做出毛绒层次）
  for (var i = 0; i < 62; i++) {
    var px = rnd(i * 5 + 11) * w;
    var py = rnd(i * 5 + 12) * h * 0.86;
    var pr = w * (0.006 + rnd(i * 5 + 13) * 0.011);
    ctx.fillStyle = (i % 4 === 0) ? 'rgba(210,154,104,0.24)' : 'rgba(255,255,255,0.68)';
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
  }

  // 洞口（略收窄，让奶油外壳更厚实）
  var hole = function () {
    ctx.beginPath();
    ctx.moveTo(w * 0.23, h);
    ctx.lineTo(w * 0.23, h * 0.66);
    ctx.bezierCurveTo(w * 0.23, h * 0.40, w * 0.33, h * 0.33, w * 0.5, h * 0.33);
    ctx.bezierCurveTo(w * 0.67, h * 0.33, w * 0.77, h * 0.40, w * 0.77, h * 0.66);
    ctx.lineTo(w * 0.77, h);
    ctx.closePath();
  };
  hole();
  ctx.fillStyle = vgrad(ctx, h * 0.33, h, '#96522C', '#E0A268', '#B76E3C');
  ctx.fill();
  // 洞口内垫
  ctx.fillStyle = 'rgba(255,226,180,0.70)';
  ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.95, w * 0.25, h * 0.065, 0, 0, Math.PI * 2); ctx.fill();
  // 洞口顶部内阴影
  ctx.strokeStyle = 'rgba(96,48,24,0.40)';
  ctx.lineWidth = Math.max(2, h * 0.04);
  ctx.beginPath();
  ctx.moveTo(w * 0.245, h * 0.65);
  ctx.bezierCurveTo(w * 0.245, h * 0.41, w * 0.34, h * 0.35, w * 0.5, h * 0.35);
  ctx.bezierCurveTo(w * 0.66, h * 0.35, w * 0.755, h * 0.41, w * 0.755, h * 0.65);
  ctx.stroke();
  // 洞口奶白厚绒边
  hole();
  ctx.strokeStyle = '#FFF3DF';
  ctx.lineWidth = Math.max(3, w * 0.034);
  ctx.stroke();

  // 外轮廓绒边（上半椭圆 + 两条侧边），用错落小圆模拟毛绒
  var dot = w * 0.023;
  var puff = function (px, py, k) {
    ctx.fillStyle = (k % 3 === 0) ? 'rgba(255,248,232,0.95)' : 'rgba(255,238,214,0.9)';
    ctx.beginPath();
    ctx.arc(px, py, dot * (0.65 + rnd(k * 7 + 3) * 0.7), 0, Math.PI * 2);
    ctx.fill();
  };
  for (var a = 0; a <= 32; a++) {
    var ang = Math.PI - a / 32 * Math.PI;
    var ax = w * 0.5 + Math.cos(ang) * w * 0.5;
    var ay = h * 0.42 - Math.sin(ang) * h * 0.385;
    puff(ax, ay, a);
  }
  for (var s = 0; s <= 8; s++) {
    var sy = h * 0.42 + s / 8 * h * 0.58;
    puff(0, sy, 40 + s); puff(w, sy, 55 + s);
  }

  // 毛线球（落在窝旁的地毯上）
  if (opt.yarn) {
    C.yarn(ctx, w * 0.97, h * 0.91, w * 0.155, { color: '#E9A960' });
  }
  ctx.restore();
};

module.exports = C;
