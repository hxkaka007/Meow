/**
 * 背景爪印装饰（全站共用，可动）
 *
 * 不用设计稿坐标，而是按屏幕铺一层「抖动网格」：
 *   - 4 列 x N 行，每个格子用 hash 求伪随机偏移，位置稳定不闪
 *   - 约 2/3 的格子留下爪印，避免太密
 *   - 每个爪印各自有相位：上下漂浮 + 左右轻摆 + 旋转摇曳 + 呼吸透明
 *
 * 开关走 Theme.decor()（设置里的「背景爪印装饰」），
 * 颜色走 Theme.paw(alpha)，四套皮肤各自是同色系的淡纹样。
 */
var D = require('./draw.js');
var Theme = require('../core/theme.js');

/** 0..1 伪随机（同一个 i 永远返回同一个值，帧间稳定） */
function hash(i) {
  var x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
}

var Decor = {
  COLS: 4,

  /**
   * 画一整屏爪印
   * @param ctx  画布
   * @param W,H  屏幕尺寸
   * @param t    累计时间（秒），驱动动画
   * @param seed 页面种子（各页错开相位，不会整齐同步）
   */
  paws: function (ctx, W, H, t, seed) {
    if (!Theme.decor()) return;
    t = t || 0;
    seed = seed || 0;
    var cols = this.COLS;
    var cell = W / cols;
    var rows = Math.max(3, Math.round(H / cell));
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c + seed * 13;
        var h1 = hash(i), h2 = hash(i + 37), h3 = hash(i + 91);
        if (h3 > 0.68) continue;                      // 只留约 2/3
        var cx = (c + 0.16 + h1 * 0.68) * cell;
        var cy = (r + 0.16 + h2 * 0.68) * cell;
        var rad = cell * (0.082 + h1 * 0.052);
        var base = -0.55 + h2 * 1.1;
        var ph = i * 1.37;
        var oy = Math.sin(t * 0.55 + ph) * rad * 0.55;
        var ox = Math.cos(t * 0.42 + ph) * rad * 0.30;
        var rot = base + Math.sin(t * 0.48 + ph) * 0.18;
        var a = 0.68 + 0.32 * (0.5 + 0.5 * Math.sin(t * 0.78 + ph));
        D.paw(ctx, cx + ox, cy + oy, rad, Theme.paw(a), rot);
      }
    }
  }
};

module.exports = Decor;
