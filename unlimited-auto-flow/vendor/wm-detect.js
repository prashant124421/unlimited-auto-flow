// wm-detect.js — pure watermark-detection core, shared by the in-page watermark
// remover (wm.js) and the Node test/validation harness.
//
// Dual target:
//   - Browser MAIN world: injected via executeScript({files:['vendor/wm-detect.js']}),
//     exposes globalThis.__wmDetect (same mechanism as MP4Box for the video path).
//   - Node: require('vendor/wm-detect.js') → module.exports.
//
// No browser- or Node-specific APIs live here. Callers pass pixel buffers (RGBA
// Uint8ClampedArray) and an `alphaFor(size)` callback that builds a size×size luma
// alpha map (values in [0,1]); the browser builds it with a canvas, Node with sharp.
(function () {
  "use strict";

  // Normalized cross-correlation of template alpha vs image luma at (ix,iy).
  // data: RGBA (length W*H*4). alpha: Float32Array (length size*size), values [0,1].
  function ncc(data, W, H, alpha, size, ix, iy) {
    if (ix < 0 || iy < 0 || ix + size > W || iy + size > H) return -1;
    var s = 0, o = 0, y = 0, vv = 0, r = 0, m = 0;
    for (var g = 0; g < size; g++) {
      var row = (iy + g) * W, er = g * size;
      for (var x = 0; x < size; x++) {
        var j = (row + ix + x) * 4;
        var lum = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255, cc = alpha[er + x];
        s += cc * lum; o += cc; y += cc * cc; vv += lum; r += lum * lum; m++;
      }
    }
    if (!m) return -1;
    var b = o / m, xm = vv / m, S = s / m - b * xm;
    var h = Math.sqrt(Math.max(0, y / m - b * b)), dd = Math.sqrt(Math.max(0, r / m - xm * xm));
    return (h < 0.001 || dd < 0.001) ? -1 : S / (h * dd);
  }

  // Scan a rectangular region [x0..W-size]×[y0..H-size] at `step`, best NCC wins.
  async function scanRegion(data, W, H, alphaFor, size, x0, y0, step) {
    var alpha = await alphaFor(size);
    var ex = W - size, ey = H - size, sx = Math.max(0, x0), sy = Math.max(0, y0);
    var best = { x: sx, y: sy, ncc: -1 };
    for (var yy = sy; yy <= ey; yy += step) for (var xx = sx; xx <= ex; xx += step) {
      var n = ncc(data, W, H, alpha, size, xx, yy);
      if (n > best.ncc) best = { x: xx, y: yy, ncc: n };
    }
    return best;
  }

  // Coarse-to-fine multi-scale search. opts:
  //   data,W,H   full-resolution RGBA
  //   work       optional downscaled {data,W,H,f}; defaults to full-res (f=1)
  //   alphaFor   (size) -> Float32Array | Promise<Float32Array>, size×size luma alpha
  //   sMin,sMax  full-resolution scale bounds (px)
  //   scaleStep  coarse scale step in working px (default 8)
  //   spatialStep coarse spatial step in working px (default 6)
  //   cornerFrac corner-anchored search origin fraction (default 0.70)
  //   threshold  minimum accepted refined NCC (default 0.45)
  // Returns { size, x, y, ncc } in FULL-resolution coords, or null if below threshold.
  async function detectMultiScale(opts) {
    var work = opts.work || { data: opts.data, W: opts.W, H: opts.H, f: 1 };
    var f = work.f;
    var scaleStep = opts.scaleStep || 8, spatialStep = opts.spatialStep || 6;
    var cornerFrac = opts.cornerFrac != null ? opts.cornerFrac : 0.70;
    var threshold = opts.threshold != null ? opts.threshold : 0.45;

    async function coarse(cf) {
      var x0 = Math.floor(cf * work.W), y0 = Math.floor(cf * work.H);
      var wMin = Math.max(8, Math.round(opts.sMin * f));
      var wMax = Math.max(wMin + scaleStep, Math.round(opts.sMax * f));
      var best = { size: wMin, x: x0, y: y0, ncc: -1 };
      for (var s = wMin; s <= wMax; s += scaleStep) {
        if (s > work.W || s > work.H) break;
        var r = await scanRegion(work.data, work.W, work.H, opts.alphaFor, s, x0, y0, spatialStep);
        if (r.ncc > best.ncc) best = { size: s, x: r.x, y: r.y, ncc: r.ncc };
      }
      return best;
    }

    var c = await coarse(cornerFrac);
    // Fallback: if the tight corner region found nothing convincing, widen once.
    if (c.ncc < threshold && cornerFrac > 0.5) {
      var c2 = await coarse(0.5);
      if (c2.ncc > c.ncc) c = c2;
    }

    // Map the coarse winner to full-res, then refine scale + position at full res.
    var sizeF = Math.round(c.size / f), xF = Math.round(c.x / f), yF = Math.round(c.y / f);
    var win = Math.ceil(spatialStep / f) + 2;
    var sWin = Math.ceil(scaleStep / f);
    var sLo = Math.max(opts.sMin, sizeF - sWin), sHi = Math.min(opts.sMax, sizeF + sWin);
    var best = { size: sizeF, x: xF, y: yF, ncc: -1 };
    for (var s2 = sLo; s2 <= sHi; s2 += 2) {
      var alpha = await opts.alphaFor(s2);
      var exx = opts.W - s2, eyy = opts.H - s2;
      var bx = Math.max(0, xF - win), by = Math.max(0, yF - win);
      var Ex = Math.min(exx, xF + win), Ey = Math.min(eyy, yF + win);
      for (var yy = by; yy <= Ey; yy++) for (var xx = bx; xx <= Ex; xx++) {
        var n = ncc(opts.data, opts.W, opts.H, alpha, s2, xx, yy);
        if (n > best.ncc) best = { size: s2, x: xx, y: yy, ncc: n };
      }
    }
    return best.ncc >= threshold ? best : null;
  }

  var api = { ncc: ncc, detectMultiScale: detectMultiScale };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof globalThis !== "undefined") globalThis.__wmDetect = api;
})();
