// wm.js — watermark-removal helpers injected into the Flow page (world: MAIN) via
// chrome.scripting.executeScript. Augments globalThis.__inj (defined in inject.js).
//
// Same constraints as inject.js:
// - Kept un-obfuscated (the production build copies this file verbatim). Each helper
//   on __inj is stringified by executeScript and run inside the Flow page, which has
//   none of the bundle's scope — so every function is fully self-contained (no shared
//   closures, no outer consts). Watermark templates are therefore inlined as base64
//   inside each function body rather than passed as args or loaded as assets.
//
// How it works: Flow stamps the Gemini "sparkle" logo alpha-blended onto the bottom-
// right corner. Given the logo's known per-pixel alpha (a grayscale template), the
// blend is reversible:  original = (observed − alpha·logoColor) / (1 − alpha).
// Placement is found by normalized cross-correlation (NCC) of the template against
// the image luminance, so a drifted/repositioned logo is still located.
(function () {
  // In the side panel, inject.js has already created globalThis.__inj. When this file is
  // loaded as a content script on flow.google.com (no inject.js present), create it here
  // so the assignments below don't throw.
  globalThis.__inj = globalThis.__inj || {};

  // Clean a single image: load it, reverse-blend the corner logo, return a PNG blob
  // URL (lossless — no second JPEG pass, so 2K/upscaled quality is preserved).
  // Returns { blobUrl, removed } or { error }.
  globalThis.__inj.cleanImageBlob = async function (u, logoVersion) {
    // 2026 sparkle watermark templates (added alongside the originals).
    var TPL96_2026 = "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAVs0lEQVR4nK1c23biNhTFdzD3kGSm7eoH9KH//zN97OpiJgQDAWxsY3eFnZxsjmTjzIweZoiRZOnoXPa5CKf33hzHqeuaP3uedz6fpYO1583mOE6v1zP7u65bVZX8ORwO//zzz/v7e9/3kyT5559/DodD+5CmJsvm9XccazZXPmEP2I/rvj6vGmbsTh105v6YWS/CdSNqQRBEUWT277hDeZ1Qx/M8jLW+3drQ08V/zqXx7Ofz+VNscrN5l8ab5N2CIlEU9fv9IAjCMIzjGDRSRGmiL/9p0tEqB9YmU2GSqqre/jZp8Qup07sssWWVQRBMp9PRpQ2Hw8FgMBqNhIl46VYm6shZXdjHnMr9GVr4vt/7FS2+tMFgEASB7/v9fn9wae2junATP6wurUt/UTVXOqi7fEory9Iqt+pJe/M8LwgCiHlVVdBZnudFUdQ+/CY33dx8Fz3bpgLdz5BMzATPc5P5XdcVgYIYns/nqqqCIAATKaXwqeVZ9Z0pMUwvywpbll5VVXcacWdz1Ks5sE0VBEEcx+PxuN/vg4PO57Pruv1+fzweD4fDlgVYqY/dtu9ZtXYNo4WCX++9W8fPaji2qbBf/IT/BbOEYej7PgiEr3zfj6LI9/3uJ8SA6xdamDa8cya78wMoCzx1Pp8/5Pmyc5bEMAyHw+FoNArD0HGc8/lcliWohufKlklTPGJlmU/xkTkW7e18AFJ+RmGbUzOawL/lpUlP13Vh2mG/BA04jhOGYb/fh+1Xa0PrwiM/w0ewFXVdvxECki/M/2OovGlxTScZhiE0cRAETAVB84PBADSyDuf+Cq//wnalDqqqEkVgLqLXrbVjTp5nOp2Ox+PBYCBeTl3X4CCc1mAwmM1m8/ncFDSeh13IJln7YXFzeWSXWZzL6ls6Kx9FurESdRwniiKAQ8/z6rouy/JN5l23rmsAIpiz0WgEG8dvsfILu5MtndsViBr+uho+QOsLnOvjAos1sfTN58Idk8lkOBxCN4OFpQ9WBTrOZrN+v99RLZqypsIJN5lADX/zFUCdjtrHIVLelHzsUz5AhIfD4Xw+v7+/Hw6HmAHUQQc5A+Bpx3Gm0+l+vzcDIGaUxlQRaoWf1VZvwiKr5Bc75OKDfDhGPme1VqsBlvll51EUARzCyQB6tqoVIIPhcDidTq2uHxYmnxm4/YwtviLQz8R9HEP/WUdxn36/f3d3N5lMxAXjQ2Lq41vf9yeTyXw+n06nYuza40Tt8axPNbd7DLAiHaH4S4a47qvWZ5+DTxW+xZcvXx4fH4fDIXOE9GGSif2Oomg6nc5mszAMVX9rszrun2ofW2j5jpvYFyXJoI7wuQIK8kEG9vv9+Xw+Ho+DICguDX0UxXmGuq5934/jeDgcWjmo6Yl6/imJkwVcSTWcJmtkq27WbUp/WY8O4eEoiu4ubTqdgjpK78ifIARWUtc1/LWiKGazWVEUp9PJfIt4yyriwQv7AQx8RVT2m35hcy8emed54/F4NptB9SinhOESmwJZkud5YRjOL63lXS1RkR/zEPyWke7P+RwcIYKi/f3332ezmed58MggjApJoonkynN4sIvFIgzDsizX67XJEVa2Mj9/al+vBGrqXf2cnpPhnudNJpMvX748PDzA7YLLLmrYJI1VNMCDURQBdj89PTWtsJ0En5I1ezzIDJ5yawqqNsWD4ziezWbT6XQwGERRBB3McoR/gVyg7FgPYjOIw0LQ4jiGH2d19Lsc7ac5SFEUf1YdOIvHmjzseV6/3394eLi/v4fHwJauyYkFLWRC8BRGIao/Ho8xdrlcpmnaPatzs+GQyrKULbzpIMXVJpe6zTzZQlkxW4AwjuNA+yibKPsXcRPdJKABfIewzGAwAP7Osqyua7ggTeCwizSxL6GMskUHwdi3TOrSK9WyeJTv+6PRaDKZTKfTKIqqqjqdTqJ3lJZR/po4q8qDkah+FEWTyeR4PJ7P59PpBK1kRbkfCZzLG60d+E+2DK8QTG0bJrm7WDnvvrhqiAd+/fp1Pp9PJhPP8wQTyuZ5EqEau8FWNC8mX9DD+XzebDZFUajaAnxGH0ZVbDeb4l9CKQ32uyRqKuIv8LwaFYbhbDZbLBbz+RziIBKkIirmEk1iyXIZx0NNDIdD2XmSJEVR8N54a2wxFY9YYxLyRHNQO2l6l6aqPszZ7+7uHh4e4JFKpp8LLdRYkSw5fLPURG34jf8v8Epck+/fv6siA2ZGtpvtvCMDPwiEsF577+raNitBwCsRAPzy5ctisUAkEIkKAGLz0IQcMr+VFipmIkYQRg0d8GG/36dpat0Lz88srPQRm4XXafEFc4Q1LlPTrqzxoLquoXcQRe73+3VdQ+/I5Gqg0sGKagKOWKMLUBL1J+7+3d1dURRhGCZJkqapEmomt/K6mYiiH2Wnr+k6s5MCuA4NMA+Z8c5isZhemuM4RVGUZamEyLTu5sqEmzAE9MUHViV4gm8Hg0Ecx57n7Xa7IAhWq1Wapqp0QFHB+pUlXNcS/a6vydyUtPQ8Dz7kYrFAlkLOmU2s9D+fz77/9l4hWVmWnuc1GXvhJmEBoaD4t3BEkIz1fX+z2Tw/P3OYqYlrlGRxz1cvsoWQaFbOl+a67nw+/+OPP5ACDMNQHAWWDlbD0HewRMKSsMRmvAkuGB6y6ZT4FD7DuavrGscDHFCWZZIkHHFnVpUXqX2pw7gikIgPo6GalCt3FqD89evXh4eHfr8fhiE0Dis5sIZoBGsaS+RFUoayaFhM4RHW2SxBoJTv+57n+b6P4hBEkZIkwUmY+p4pIo2zBq/MqOIScjJs9WuDa8IwDIJgPB4/Pj5Op1PANplXALtCH0waPgNVScI9Bd2ZzgcrI3RGBA4iFscxTES/339+fs4vrQltyzJMJPg2u5WKPWoCRh3HWSwWk8lkNBrB/8S5MYsqo6NMuDLYyiAIr7E14Ew/D1FRRA62wUqgIGC1Wm02m2/fvmVZpqjAIJs/S3tVlibXKRq574GI6XSKlNb40obDYRAEUpIgeMy0TZyMZTzFR8p6V1GTSSNJV6ay/CmBEVT2ARzByPq+//z8fDqdALhNWGcl05sOYlqoaHzv4lgNBoMwDEEXKGNMBPFmC60O38TNSsrAfWy/mI/Y87BGGlnKxKUQrQRPyPd9hHrjOH55edlut2maZlnGVUvyQcJVb6fCK1bYpPdeofL4+BjHMVxzRJTF2+DzZL0jL2ByK5kXH40tndIRVkKr2AivXyEDGYsSvzzPsyx7fn5OkiTLst1ul+e5kinlcn1YMYaC7DdML+C4f2lwDmFBzIiyKo408YHIghI9WaIKdLAOUoKpvrLichWTkTwlglN5no9Go/2lFUUhcEGfovpbCirAkKPRCDliEWYrowmJxWCrzSgZFKlBT2X4IR1iTNuztay/VX0Tog5QBTh1uCbwDXu9XpZlx+MxTdPD4XA6nV5eXrIs0yl4DPY8D7VMKGqaTCZhGI5GoziOQXspjmM13BR1N7dhRnUVeDV9YP5sjVQ0qXyTuaTDxwWDi2KCkjocDiATCFQUxX6/F13uwOdG3nIwGACqy7UJ90I7NhAclOPCAeYUcaAA7ZhH5FStcEZxpRy7wAW2Uya2YmIJLmP9iAnBU7KLsizzPC+KIsuy0+nU6/UOh8Nutzsej6+a5O+//8YlCfzLQNujiRiDm06ZeA8SkFcqSTGXIrEZijaJrgYqZjHtg1KCiqf4LWIiZLYsyyB0WZb5KHBDvVcYhnAUoKuqS5Nts3JVq1TxM47+KnHjGVh9mCZJeUzmUTFR+Lk4/WpCJW7MufAEID2u6+Z5PhgMsizL8/zDP1C5MOU31sSipqZQsmZicbHiUrajHH3+V9CgCkIqi4mpTEJwH1meqqpQvMznIT4gXuH89ddfuI00Ho+hkhHuFalxiWRs2tmfUgEjxTiKiZhxzMauBusUZkwOgLSEa1QA0/QZWCx4/XmeHw6HPM9f0zCw6FEUIcAO0qB4J7x4pKCUBOrZEWXCqUgIf8skE1Wqtqo2oHI1TVLGgSdl6ZSeYglgRgZ6hLeUpikAESwa/vSPxyMGpGkK5yWO47IskQX1Lk0QnRlSkv0rG8RogDlRCT/jINHWSjZZPGE6TCWtbGXLacle5BZAWZb7/T7P85dLq6oKjgjg0pUeBYGBmOWSQHxpAkZVYJg9DPPcTH6xioPpSSl8ZM4g8SOrTZADMCG4RKzqugZQPBwOAD5ZliGRfYXX5JyDIJC0HL4LL2UCcMGAlUajkX9pytjJQs3cEZYl2Jq9GXYL2X2X/qbLqkhsJrxExXJ6ChZKSH84HLJLW6/X+/3+eDwifJ7nuemLaQ5SdWbuZeq7uzvUmc7nc0Btxo2KC2STyopDu0mOWHYoQNSamFPGXmk0FRhU5oxpKrGHqqqSJNlsNvBaQR1+o8r6WWy2NXs1uHgh8/kclEIkaDAYgI8UYDUjEkICzgXzZjiTo+xgUyTAVMZKJJEaQPYJKXwUW4M6RVFw4XXTHfi3rJvVD6pptwgUFEURRRGA+WKxEK3EtXvK3AjtzECPKYDmbpuaeD9iPRRneZ4ngpxl2X6/3+12q9UKKNmkRVMiyJ5gNJMZPWpxHN/f39/d3T0+PkK2xZCZwXBG9yaXieYCiaWDNT3NhbTMKVb7KIxTFEWSJC8vL+v1ervdWgmhCj9Y2NtOSZqYAyFBGIZIacznc2hxjjFyCkCBOtPkq6CaqYyZO0wHlScBIsGfZVm+vLwkSYLwGJAOI2lr0tlEsFdpHx4jSLom9SGDIWUAV7/99ht8GRYl9lrYvjDeUWkJ5VJKpoynVajCzC9j2SgV3u12y+Vys9nARzfjKmb4nKmhCaS8EhXKOpNLIfOeTidQqigKSXIwNWVjinYqRC9LVEF4Fbo3bbyIGPQx5BQ4+HA4LJfL9Xot6TZFAoHg1goYGaJDrgq8u9d5UXb55H2bzcZxnPv7+7qu7+7ucEUFx6gEipWLAr6iUJk14BUyXDbjJFI/6Ps+kN5ms0GeZ7fbKWVsRp2s1omfX3EQv9gMYjjXEJk/bLdbRJuqqkJJmVUrq5g8411eOj9X3G3yuyypLMvT6bTdbler1XK55Gr8JhfEJIdZQKLNvBm1QhNmZteRQzBpmq5WK6kYhLsLcGH6AazX5KHIgvK5mb5KAQVBAAsI/3u1WsGWp2na+0xTyl6iFFcixs3MHPToR2b4IQ9BSWVRFLAm0+kUiQRkOFWcyMoyJnWsQXtWbbhnvt/vkyR5enoCCORDbSeK6BC2Qiw6rwTi1fC5OcaJyeqFC5hqgGTwaMA48/kcQ8SfUMUlLHpmJFcJmnqOguaqqqB0ni7NzKw3IcCmSls1ShdQsel13k+YBysxNrUgVox5PM+T/K8ElfDcerYqDCS3e/mogAAwA2Ja6/V6tVrh9oYigeJWVWFk9jf9pKsCKgVMqvfF4fxxYkoEZD8cS8vzfL1eI9YLWZOcHOfaxVRLfYxMCPvFRFdFWeCgLMsgWXK3RcF0/sDelhnYUmSSzx+Xevl6AOsLaVKhYEa2FNgFjFoul1KSEscxM47wpqqbkmUp6si7wIxI0r28vDw9PX3//v3bt28cLzfvOVgjvEq0ref9UcQJEnBKh7ODlU0+TdZTxS69Xm+73SKAi/vLcCDNnwDD202wqnJnAOswMUiEwskSrlSpROv+2YqzVlX6SPJuV1aM5ZNlrX6fscnrVYwtT7Is2263uNoNf02WqAJJKiqq3sXRNYQWgHeenp7yPFfxA2V/2YQz9BW/RO6vMZQRzGEx8xxD8BruG1mbiVBx02S5XMqPCYjfLLV1sjc4N+yaMOySnH1Zltvt9vv37//99584WezWW3M7gsj4ORYAJfBGDt+X+gW89K0ET+kRLpfsGe1TNxRxh2W73Q6Hw+PxiB+ZEBvH+7eGOHgqueGzuzRR5BA6zuiqcJpUQ3C82RQRqVq5smJKsrrzC5oS3Z7RwMCr1QohPtQJowKftS83pRClvOJ0Oh0OhyRJvn37liQJGFzF2E3KinxZ/TJ5F69fJeY018jGeg2thY5m1lDqrFar1b///rterwG15dI8o0G1Yp4WBcbb7Xa5XEoBdMerdKIZzQwd52ZUEcBbDK9pUvPdbocbmubPnvGfCF/BWRNRN2NmyuOTEEJRFM/Pz5vNpunup3WRXW49s22Rhq9uF5J7VG3HJSmyPXUjSi1C8A5sc5Ik2+0Wv+YC66YOQ+X28Dqk8Z6enpIkOZ1OViq05LJZyap13r7jxGduFavze/5HLYi/vfl7eZLJqKoKuTpJBClcJ36WWB9oH1wtEEdUIFWTHlR8LT6TSb6WZb/OI51Q/NFyj9h9Pwez6rHLmzBKxOR4PDKqVKFrsUeAKlmWAfXwlbkmoqgfjZWvPgVZpH1c6hUk2sR1FT1s+nyzlWW52WzCS0M8hHEQ+yISJMqybLPZrNdrifK0SBOzvLnIjmd5dXEGf+PGtRnWd5t1nvm8XcrYXKZpiuCR3JeSyjhFnaIopBil+2KaqABZa9LxSirx4QMHWW86V/SrB6yqOy6oqcPxeNxsNtvtFjdQ8GsDHNAACEjTFMkJhHStFYztL5WeLSyvQh/6PryM6ci3PWodpVqVsktVDuoAVUZADhOOW5qm6/XamgvlSKCa37qFplVZze5Hty47bBps5tGtTXnJICv82MPhgIf8I50caUWpjqov4JmbWIMXZj3IG9ZdDvXm9qRZadF0OE2Ek18GQJAf1bYS+ZcgA/48XBq8CvMV1vmtfNF0kF1O94r527VgRVXr7ZOqk2ySxOPxiAu48mMwXDeETMlut4PLrl5qxTsdfz+DOzOess/f9D6phnJpvILUHcXK1F9ibo/Ho5QwMYbO8xyWTipUTFfR/K3gjjpbJjR9XfWKNwKZSpTXVNnsovnTJzd5UCkLPEd9ICrg+JcI8zxHwQpyJGo2gEn5jRbBh5/9GRgr4lXfXj3i+gdhE/d6EeZu2Uw2AQV+IicvhQaoM2V5RJrU1M0KkeBC7NV+jHNqemKSxq5Pm+RTEaJ6L9gyZ++OgITcaIgn4GIE7m1JPidN0/1+j1+/aRdnq4zIE4Hm4k7d9MiUhbkBItz3o5byQlZAypS26GM5ImWYi6JILw0+upSFnc/n4/EoBGo/A1ZGZqqLl6qOylyhhVjWV3IowHnXfGZeyTzJJi3QskP4E0qKpaqmyXrw4SkcrN5r/Y0sExibquDtqhL3MAtweu/1h6rYw9q6gFrrczBLlmWIGYGn9vu9uRgzdtFihnis1YY0+V/c/y3sgi+a0tjVNb3bQXq7x2x9jjg8bv7hehtK39u3ba7n5nvNBbf0f1N/Vrp8ClBYW0fPHp+BCXH3X6rfJaVzs/1ArqFLe3MMrU9vluB6DcqYL4i2zKBcZ0gWKhFQHyJW/1Oi2hIO/4EGlfI/AzhtHZqiOv4AAAAASUVORK5CYII=";
    function loadImg(src) {
      return new Promise(function (res, rej) {
        var im = new Image();
        im.crossOrigin = "anonymous";
        im.onload = function () { res(im); };
        im.onerror = function () { rej(new Error("image load failed")); };
        im.src = src;
      });
    }
    // Decode the 96px master once; build size×size luma alpha maps on demand (cached).
    var _tplBmp = null, _alphaCache = {};
    async function ensureMaster() {
      if (_tplBmp) return;
      var bin = atob(TPL96_2026), arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      _tplBmp = await createImageBitmap(new Blob([arr], { type: "image/png" }));
    }
    function alphaFor(size) {
      if (_alphaCache[size]) return _alphaCache[size];
      var oc = new OffscreenCanvas(size, size), cx = oc.getContext("2d", { willReadFrequently: true });
      cx.drawImage(_tplBmp, 0, 0, size, size);
      var d = cx.getImageData(0, 0, size, size).data, v = new Float32Array(size * size);
      for (var i = 0; i < v.length; i++) { var p = 4 * i; v[i] = Math.max(d[p], d[p + 1], d[p + 2]) / 255; }
      return (_alphaCache[size] = v);
    }
    try {
      var img = await loadImg(u);
      var W = img.naturalWidth, H = img.naturalHeight;
      var c = document.createElement("canvas"); c.width = W; c.height = H;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      var id = ctx.getImageData(0, 0, W, H), data = id.data;
      // Latest (2026) sparkle logo only — the old logo generation is no longer checked.

      // Local background luma around a size×size box at (ix,iy) (ring outside the box).
      function bgLuma(size, ix, iy) {
        var pad = Math.max(6, Math.round(0.3 * size));
        var ax = Math.max(0, ix - pad), ay = Math.max(0, iy - pad), bx = Math.min(W, ix + size + pad), by = Math.min(H, iy + size + pad);
        var sum = 0, cnt = 0;
        for (var yy = ay; yy < by; yy++) for (var xx = ax; xx < bx; xx++) {
          if (xx >= ix && xx < ix + size && yy >= iy && yy < iy + size) continue;
          var j = (yy * W + xx) * 4; sum += 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]; cnt++;
        }
        return cnt ? sum / cnt : 0;
      }
      // Overlay opacity (transparency) by least squares. The white logo lifts luma by
      // ~α·templateAlpha·(255−bg) over the sparkle pixels, so solving for α measures how much
      // was ACTUALLY blended in — this is both the presence signal (α≈0 → no watermark) and the
      // exact reverse-blend strength. Replaces the old fixed NCC-shape threshold, which judged
      // shape similarity (a weak proxy) and skipped faint marks over busy art.
      function estOpacity(alpha, size, ix, iy) {
        var bg = bgLuma(size, ix, iy), num = 0, den = 0;
        for (var v = 0; v < size; v++) for (var r = 0; r < size; r++) {
          var t = alpha[v * size + r]; if (t <= 0.06) continue;
          var off = ((iy + v) * W + ix + r) * 4;
          var lum = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
          num += t * (lum - bg); den += t * t * (255 - bg);
        }
        return den > 1e-3 ? Math.max(0, num / den) : 0;
      }

      if (typeof globalThis.__wmDetect === "undefined" || !globalThis.__wmDetect.detectMultiScale) {
        return { error: "detect lib not loaded" };
      }
      await ensureMaster();
      // Locate the sparkle PER IMAGE. The stamp is NOT pixel-fixed: across a real batch its
      // centre clusters near ~91px in from each edge (720p baseline, scaled by min(W,H)/720)
      // but drifts ±30–40px and varies ~40–90px in size. A single fixed box therefore clips
      // outliers and leaves the diamond outline behind, so we search for it. Detection only
      // LOCATES (position + scale) — we still ALWAYS remove (see below), so a low detector
      // threshold is fine; it just decides whether to trust the match or use the fixed spot.
      var vscale = Math.min(W, H) / 720;
      // Downscaled working buffer (long edge ~1000px) keeps detection cost bounded on 2K art.
      var f = Math.min(1, 1000 / Math.max(W, H)), work;
      if (f < 1) {
        var ww = Math.round(W * f), wh = Math.round(H * f);
        var wc = new OffscreenCanvas(ww, wh), wx = wc.getContext("2d", { willReadFrequently: true });
        wx.drawImage(c, 0, 0, ww, wh);
        work = { data: wx.getImageData(0, 0, ww, wh).data, W: ww, H: wh, f: f };
      } else {
        work = { data: data, W: W, H: H, f: 1 };
      }
      var sMin = Math.max(24, Math.round(30 * vscale)), sMax = Math.max(sMin + 8, Math.round(96 * vscale));
      var det = await globalThis.__wmDetect.detectMultiScale({
        data: data, W: W, H: H, work: work, alphaFor: alphaFor,
        sMin: sMin, sMax: sMax, cornerFrac: 0.66, threshold: 0.30
      });
      // Remove ONLY where a watermark is actually located, and only when the match lands in the
      // bottom-right corner window where the mark can plausibly sit. There is NO blind fallback:
      // on accounts/regions Flow doesn't watermark (or whenever detection doesn't find it),
      // stamping the sparkle shape onto clean pixels produced a "black sparkle" artifact, so we
      // leave the image untouched instead. (Accounts with no watermark are also gated upstream by
      // the panel's wmPresent check; this is the per-image safety net.)
      var pos = null, size = 0;
      if (det) {
        var dcx = det.x + det.size / 2, dcy = det.y + det.size / 2, inR = W - dcx, inB = H - dcy;
        if (inR >= 0.03 * W && inR <= 0.22 * W && inB >= 0.04 * H && inB <= 0.28 * H) {
          pos = { x: det.x, y: det.y }; size = det.size;
        }
      }

      var removed = false;
      if (pos) {
        var alpha = alphaFor(size);
        // Remove at the located spot. (No transparency gate here: on light/tan backgrounds the
        // additive-white mark barely shifts luma, so a gate read ~0 and wrongly skipped it — and
        // we only reach this branch once the mark has actually been located above.)
        //
        // 1) Reverse-blend: undo the additive-white overlay to restore the true content that sat
        //    under the sparkle. gain = estimated overlay opacity, floored to 0.5 so a faint mark
        //    can't under-correct. This restores the semi-transparent fringe well but on its own
        //    leaves a faint sparkle OUTLINE over mid-luma / textured backgrounds (grass, wood,
        //    cloth) that the old bright-only + dark-only cleanup couldn't reach — so we follow it
        //    with an inpaint fill over the core mark.
        var opacity = estOpacity(alpha, size, pos.x, pos.y);
        var gain = Math.max(0.5, Math.min(1, opacity)), logo = 255;
        var v0 = Math.max(0, pos.x), r0 = Math.max(0, pos.y), m0 = Math.min(W, pos.x + size), b0 = Math.min(H, pos.y + size);
        for (var Y = r0; Y < b0; Y++) for (var X = v0; X < m0; X++) {
          var dy = Y - pos.y, dx = X - pos.x;
          if (dy < 0 || dy >= size || dx < 0 || dx >= size) continue;
          var al = alpha[dy * size + dx] * gain;
          if (al < 0.002) continue; if (al > 0.99) al = 0.99;
          var one = 1 - al, off = (Y * W + X) * 4;
          for (var kk = 0; kk < 3; kk++) { var val = (data[off + kk] - al * logo) / one; data[off + kk] = Math.round(Math.max(0, Math.min(255, val))); }
        }

        // 2) Residual cleanup. Reverse-blend still leaves a faint sparkle OUTLINE, and the right way
        //    to erase it depends on what surrounds the mark. Measure the local background ring (mean
        //    colour + luma std) just outside the mark box:
        var pad2 = Math.max(6, Math.round(0.3 * size));
        var ax2 = Math.max(0, pos.x - pad2), ay2 = Math.max(0, pos.y - pad2), bx2 = Math.min(W, pos.x + size + pad2), by2 = Math.min(H, pos.y + size + pad2);
        var sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0, cn = 0;
        for (var yb = ay2; yb < by2; yb++) for (var xb = ax2; xb < bx2; xb++) {
          if (xb >= pos.x && xb < pos.x + size && yb >= pos.y && yb < pos.y + size) continue;
          var jb = (yb * W + xb) * 4, lb = 0.299 * data[jb] + 0.587 * data[jb + 1] + 0.114 * data[jb + 2];
          sr += data[jb]; sg += data[jb + 1]; sb += data[jb + 2]; sl += lb; sl2 += lb * lb; cn++;
        }
        if (cn) {
          var bR = sr / cn, bG = sg / cn, bB = sb / cn, bL = sl / cn;
          var std = Math.sqrt(Math.max(0, sl2 / cn - bL * bL));

          // FLAT / SOFT corner (low luma variance: flat colour, gradient, sky, grass, walls) — safe
          // to INPAINT. Build a mask of the sparkle shape (template alpha, dilated to catch the faint
          // tips) and diffuse the surrounding pixels inward (each masked pixel → average of its
          // already-known neighbours). This erases the outline into whatever surrounds it, regardless
          // of luma, where the old dark-only pass couldn't. We only do this when the corner is flat
          // enough that filling is invisible; over hard content edges an inpaint would smear, so those
          // fall to the structure-preserving branch below. (The interactive pill exposes this as the
          // manual "Erase (fill)" option for any image.)
          if (std < 24) {
            var DIL = 3, ATHR = 0.08;
            var mask = new Uint8Array(size * size);
            for (var my = 0; my < size; my++) for (var mx = 0; mx < size; mx++) {
              var tv = alpha[my * size + mx];
              for (var dyy = -DIL; dyy <= DIL; dyy++) for (var dxx = -DIL; dxx <= DIL; dxx++) {
                var ny = my + dyy, nx = mx + dxx; if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                var av3 = alpha[ny * size + nx]; if (av3 > tv) tv = av3;
              }
              mask[my * size + mx] = tv > ATHR ? 1 : 0;
            }
            var cur = new Uint8Array(mask), MAXP = 4 * size;
            for (var pass = 0; pass < MAXP; pass++) {
              var changed = 0, next = new Uint8Array(cur);
              for (var cy = 0; cy < size; cy++) for (var cx = 0; cx < size; cx++) {
                if (!cur[cy * size + cx]) continue;
                var Rs = 0, Gs = 0, Bs = 0, nn = 0;
                for (var ky3 = -1; ky3 <= 1; ky3++) for (var kx3 = -1; kx3 <= 1; kx3++) {
                  if (!ky3 && !kx3) continue;
                  var ay3 = cy + ky3, ax3 = cx + kx3, gx = pos.x + ax3, gy = pos.y + ay3;
                  if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
                  var inBox = ax3 >= 0 && ax3 < size && ay3 >= 0 && ay3 < size;
                  if (inBox && cur[ay3 * size + ax3]) continue; // neighbour still unknown this pass
                  var o4 = (gy * W + gx) * 4; Rs += data[o4]; Gs += data[o4 + 1]; Bs += data[o4 + 2]; nn++;
                }
                if (!nn) continue;
                var o5 = ((pos.y + cy) * W + pos.x + cx) * 4;
                data[o5] = Math.round(Rs / nn); data[o5 + 1] = Math.round(Gs / nn); data[o5 + 2] = Math.round(Bs / nn);
                next[cy * size + cx] = 0; changed++;
              }
              cur = next; if (!changed) break;
            }
          } else {
            // DETAILED corner (hard edges/structure crossing the mark: shelves, cans, drawers, cords).
            // Inpainting here would smear recognisable structure, so instead fade the additive-white
            // residue toward the local background COLOUR — alpha-weighted and clamped so no channel
            // drops below background (never a burn), and skipping pixels that aren't leftover-bright
            // (ink lines, dark texture crossing the mark are left intact). On DARK backgrounds the
            // outline also has slightly-DARKER edges the bright-only pull can't reach, so there we
            // widen the mask, drop the brightness gate and scale the pull up as the corner darkens.
            var dark = bL < 60;
            var athr2 = dark ? 0.02 : 0.06, gate = dark ? 0.5 : 3, dil2 = dark ? 4 : 0;
            var boost = 1 + 6 * Math.max(0, (60 - bL) / 60);
            for (var vy = 0; vy < size; vy++) for (var rx = 0; rx < size; rx++) {
              var t2 = alpha[vy * size + rx];
              if (dil2) {
                for (var ky = -dil2; ky <= dil2; ky++) for (var kx = -dil2; kx <= dil2; kx++) {
                  var yy = vy + ky, xx = rx + kx; if (xx < 0 || xx >= size || yy < 0 || yy >= size) continue;
                  var av = alpha[yy * size + xx]; if (av > t2) t2 = av;
                }
              }
              if (t2 <= athr2) continue;
              var o2 = ((pos.y + vy) * W + pos.x + rx) * 4;
              if (0.299 * data[o2] + 0.587 * data[o2 + 1] + 0.114 * data[o2 + 2] <= bL + gate) continue;
              var w2 = Math.min(1, t2 * boost);
              if (data[o2] > bR) data[o2] = Math.round(Math.max(bR, data[o2] - w2 * (data[o2] - bR)));
              if (data[o2 + 1] > bG) data[o2 + 1] = Math.round(Math.max(bG, data[o2 + 1] - w2 * (data[o2 + 1] - bG)));
              if (data[o2 + 2] > bB) data[o2 + 2] = Math.round(Math.max(bB, data[o2 + 2] - w2 * (data[o2 + 2] - bB)));
            }
          }
        }
        removed = true;
      }
      ctx.putImageData(id, 0, 0);
      var blob = await new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/png"); });
      if (!blob) return { error: "toBlob null" };
      return { blobUrl: URL.createObjectURL(blob), removed: removed };
    } catch (e) { return { error: (e && e.message) || String(e) }; }
  };

  // Prepare a single image for INTERACTIVE watermark removal (the in-page Flow pill's
  // fine-tune slider). Same detection + gain estimation as cleanImageBlob, but instead
  // of returning one finished blob it returns a handle whose render(strength) re-applies
  // the un-blend at a user-chosen strength (strength = 1 → the auto-estimated gain; 0 →
  // no removal) and returns a fresh PNG blob URL. Each render recomputes the logo box
  // from a pristine copy of the original pixels, so strength can be dragged up and down.
  // Returns { ok, removed, autoStrength, box, render(strength) } or { error }.
  // (Content-script-only — not stringified for executeScript, so it may be called directly.)
  globalThis.__inj.cleanImagePrepare = async function (u) {
    var TPL96_2026 = "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";
    function loadImg(src) {
      return new Promise(function (res, rej) {
        var im = new Image();
        im.crossOrigin = "anonymous";
        im.onload = function () { res(im); };
        im.onerror = function () { rej(new Error("image load failed")); };
        im.src = src;
      });
    }
    var _tplBmp = null, _alphaCache = {};
    async function ensureMaster() {
      if (_tplBmp) return;
      var bin = atob(TPL96_2026), arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      _tplBmp = await createImageBitmap(new Blob([arr], { type: "image/png" }));
    }
    function alphaFor(size) {
      if (_alphaCache[size]) return _alphaCache[size];
      var oc = new OffscreenCanvas(size, size), cx = oc.getContext("2d", { willReadFrequently: true });
      cx.drawImage(_tplBmp, 0, 0, size, size);
      var d = cx.getImageData(0, 0, size, size).data, v = new Float32Array(size * size);
      for (var i = 0; i < v.length; i++) { var p = 4 * i; v[i] = Math.max(d[p], d[p + 1], d[p + 2]) / 255; }
      return (_alphaCache[size] = v);
    }
    try {
      var img = await loadImg(u);
      var W = img.naturalWidth, H = img.naturalHeight;
      var c = document.createElement("canvas"); c.width = W; c.height = H;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      var id = ctx.getImageData(0, 0, W, H), data = id.data;
      var orig = new Uint8Array(data); // pristine copy so render() can re-run at any strength
      function toBlobUrl() { return new Promise(function (res) { c.toBlob(function (b) { res(b ? URL.createObjectURL(b) : null); }, "image/png"); }); }

      var GAINS = [1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.34, 0.27, 0.2, 0.14];
      function estGain(alpha, size, ix, iy) {
        var pad = Math.max(6, Math.round(0.3 * size));
        var ax = Math.max(0, ix - pad), ay = Math.max(0, iy - pad), bx2 = Math.min(W, ix + size + pad), by2 = Math.min(H, iy + size + pad);
        var sum = 0, cnt = 0;
        for (var yy = ay; yy < by2; yy++) for (var xx = ax; xx < bx2; xx++) {
          if (xx >= ix && xx < ix + size && yy >= iy && yy < iy + size) continue;
          var j = (yy * W + xx) * 4; sum += 0.299 * orig[j] + 0.587 * orig[j + 1] + 0.114 * orig[j + 2]; cnt++;
        }
        if (!cnt) return 1;
        var bg = sum / cnt, bestG = GAINS[0], bestErr = Infinity;
        for (var gi = 0; gi < GAINS.length; gi++) {
          var g = GAINS[gi], err = 0, wsum = 0;
          for (var v = 0; v < size; v++) for (var r = 0; r < size; r++) {
            var a0 = alpha[v * size + r]; if (a0 <= 0.04) continue;
            var al = Math.min(a0 * g, 0.99), one = 1 - al; if (one <= 1e-4) continue;
            var off = ((iy + v) * W + ix + r) * 4;
            var lum = (0.299 * (orig[off] - al * 255) + 0.587 * (orig[off + 1] - al * 255) + 0.114 * (orig[off + 2] - al * 255)) / one;
            var w = Math.min(1, 6 * a0); err += Math.abs(lum - bg) * w; wsum += w;
          }
          var e = wsum > 0 ? err / wsum : Infinity; if (e < bestErr) { bestErr = e; bestG = g; }
        }
        return bestG;
      }

      if (typeof globalThis.__wmDetect === "undefined" || !globalThis.__wmDetect.detectMultiScale) {
        return { error: "detect lib not loaded" };
      }
      await ensureMaster();
      var f = Math.min(1, 1000 / Math.max(W, H)), work;
      if (f < 1) {
        var ww = Math.round(W * f), wh = Math.round(H * f);
        var wc = new OffscreenCanvas(ww, wh), wx = wc.getContext("2d", { willReadFrequently: true });
        wx.drawImage(c, 0, 0, ww, wh);
        work = { data: wx.getImageData(0, 0, ww, wh).data, W: ww, H: wh, f: f };
      } else {
        work = { data: data, W: W, H: H, f: 1 };
      }
      var sMin = 40, sMax = Math.max(48, Math.round(0.14 * Math.min(W, H)));
      var det = await globalThis.__wmDetect.detectMultiScale({
        data: data, W: W, H: H, work: work, alphaFor: alphaFor, sMin: sMin, sMax: sMax, threshold: 0.45
      });

      if (!det) {
        // No watermark found — render() just returns the untouched original.
        return {
          ok: true, removed: false, autoStrength: 0, box: null,
          render: async function () { data.set(orig); ctx.putImageData(id, 0, 0); return await toBlobUrl(); }
        };
      }

      var alpha = alphaFor(det.size), size = det.size, bx = det.x, by = det.y;
      var autoGain = estGain(alpha, size, bx, by);
      // Reverse-blend the logo box at a given effective gain (from a pristine copy).
      function apply(effGain) {
        var v0 = Math.max(0, bx), r0 = Math.max(0, by), m0 = Math.min(W, bx + size), b0 = Math.min(H, by + size);
        for (var Y = r0; Y < b0; Y++) for (var X = v0; X < m0; X++) {
          var dy = Y - by, dx = X - bx; if (dy < 0 || dy >= size || dx < 0 || dx >= size) continue;
          var off = (Y * W + X) * 4;
          var al = alpha[dy * size + dx] * effGain;
          if (al < 0.002) { data[off] = orig[off]; data[off + 1] = orig[off + 1]; data[off + 2] = orig[off + 2]; continue; }
          if (al > 0.99) al = 0.99; var one = 1 - al;
          for (var kk = 0; kk < 3; kk++) { var val = (orig[off + kk] - al * 255) / one; data[off + kk] = Math.round(Math.max(0, Math.min(255, val))); }
        }
      }
      // "Erase (fill)": normalized-convolution inpaint of the sparkle region — each masked
      // pixel becomes a distance-weighted average of nearby NON-masked (real) pixels, soft-
      // feathered so there is no seam. Cleanly removes a sparkle the reverse-blend can only
      // partially cancel (it discards the content under the logo — fine for a small corner
      // mark). Restores the box from the pristine copy first so it can toggle on/off.
      function applyFill() {
        var R = Math.round(size * 0.7), sig2 = Math.pow(R * 0.5, 2) * 2, dil = 2, thr = 0.08;
        var mask = new Uint8Array(size * size);
        for (var i = 0; i < mask.length; i++) if (alpha[i] > thr) mask[i] = 1;
        var dm = new Uint8Array(mask);
        for (var v = 0; v < size; v++) for (var r = 0; r < size; r++) if (mask[v * size + r]) for (var d = -dil; d <= dil; d++) for (var g = -dil; g <= dil; g++) { var p = r + g, q = v + d; if (p >= 0 && p < size && q >= 0 && q < size) dm[q * size + p] = 1; }
        var soft = new Float32Array(size * size), fr = 3;
        for (var v2 = 0; v2 < size; v2++) for (var r2 = 0; r2 < size; r2++) { var s = 0, c = 0; for (var d2 = -fr; d2 <= fr; d2++) for (var g2 = -fr; g2 <= fr; g2++) { var p2 = r2 + g2, q2 = v2 + d2; if (p2 >= 0 && p2 < size && q2 >= 0 && q2 < size) { s += dm[q2 * size + p2]; c++; } } soft[v2 * size + r2] = c ? s / c : 0; }
        // start from pristine so repeated toggles are stable
        var v0 = Math.max(0, bx), r0 = Math.max(0, by), m0 = Math.min(W, bx + size), b0 = Math.min(H, by + size);
        for (var Y0 = r0; Y0 < b0; Y0++) for (var X0 = v0; X0 < m0; X0++) { var o0 = (Y0 * W + X0) * 4; data[o0] = orig[o0]; data[o0 + 1] = orig[o0 + 1]; data[o0 + 2] = orig[o0 + 2]; }
        for (var vv = 0; vv < size; vv++) for (var rr = 0; rr < size; rr++) {
          if (!dm[vv * size + rr]) continue;
          var wr = 0, wg = 0, wb = 0, ww = 0;
          for (var dd = -R; dd <= R; dd++) for (var gg = -R; gg <= R; gg++) {
            var pp = rr + gg, qq = vv + dd; if (pp < 0 || pp >= size || qq < 0 || qq >= size) continue;
            if (dm[qq * size + pp]) continue;
            var wt = Math.exp(-(dd * dd + gg * gg) / sig2), of2 = ((by + qq) * W + bx + pp) * 4;
            wr += orig[of2] * wt; wg += orig[of2 + 1] * wt; wb += orig[of2 + 2] * wt; ww += wt;
          }
          if (ww <= 0) continue;
          var off = ((by + vv) * W + bx + rr) * 4, wgt = soft[vv * size + rr];
          data[off] = Math.round(orig[off] * (1 - wgt) + (wr / ww) * wgt);
          data[off + 1] = Math.round(orig[off + 1] * (1 - wgt) + (wg / ww) * wgt);
          data[off + 2] = Math.round(orig[off + 2] * (1 - wgt) + (wb / ww) * wgt);
        }
      }
      // Adaptive residual cleanup — identical to the batch cleanImageBlob path. Reverse-blend can
      // leave a faint sparkle OUTLINE; here we measure the local background ring and either INPAINT
      // it away (flat/soft corners: flat colour, gradient, sky, grass — background-agnostic) or FADE
      // it toward the background colour (detailed corners: shelves, cans, cords — never smears
      // structure). Operates on the already-blended `data`.
      function cleanupResidual() {
        var pad2 = Math.max(6, Math.round(0.3 * size));
        var ax2 = Math.max(0, bx - pad2), ay2 = Math.max(0, by - pad2), bx2 = Math.min(W, bx + size + pad2), by2 = Math.min(H, by + size + pad2);
        var sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0, cn = 0;
        for (var yb = ay2; yb < by2; yb++) for (var xb = ax2; xb < bx2; xb++) {
          if (xb >= bx && xb < bx + size && yb >= by && yb < by + size) continue;
          var jb = (yb * W + xb) * 4, lb = 0.299 * data[jb] + 0.587 * data[jb + 1] + 0.114 * data[jb + 2];
          sr += data[jb]; sg += data[jb + 1]; sb += data[jb + 2]; sl += lb; sl2 += lb * lb; cn++;
        }
        if (!cn) return;
        var bR = sr / cn, bG = sg / cn, bB = sb / cn, bL = sl / cn, std = Math.sqrt(Math.max(0, sl2 / cn - bL * bL));
        if (std < 24) {
          var DIL = 3, ATHR = 0.08, mask = new Uint8Array(size * size);
          for (var my = 0; my < size; my++) for (var mx = 0; mx < size; mx++) {
            var tv = alpha[my * size + mx];
            for (var dyy = -DIL; dyy <= DIL; dyy++) for (var dxx = -DIL; dxx <= DIL; dxx++) {
              var ny = my + dyy, nx = mx + dxx; if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
              var av3 = alpha[ny * size + nx]; if (av3 > tv) tv = av3;
            }
            mask[my * size + mx] = tv > ATHR ? 1 : 0;
          }
          var cur = new Uint8Array(mask), MAXP = 4 * size;
          for (var pass = 0; pass < MAXP; pass++) {
            var changed = 0, next = new Uint8Array(cur);
            for (var cy = 0; cy < size; cy++) for (var cx = 0; cx < size; cx++) {
              if (!cur[cy * size + cx]) continue;
              var Rs = 0, Gs = 0, Bs = 0, nn = 0;
              for (var ky3 = -1; ky3 <= 1; ky3++) for (var kx3 = -1; kx3 <= 1; kx3++) {
                if (!ky3 && !kx3) continue;
                var ay3 = cy + ky3, ax3 = cx + kx3, gx = bx + ax3, gy = by + ay3;
                if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
                var inBox = ax3 >= 0 && ax3 < size && ay3 >= 0 && ay3 < size;
                if (inBox && cur[ay3 * size + ax3]) continue;
                var o4 = (gy * W + gx) * 4; Rs += data[o4]; Gs += data[o4 + 1]; Bs += data[o4 + 2]; nn++;
              }
              if (!nn) continue;
              var o5 = ((by + cy) * W + bx + cx) * 4;
              data[o5] = Math.round(Rs / nn); data[o5 + 1] = Math.round(Gs / nn); data[o5 + 2] = Math.round(Bs / nn);
              next[cy * size + cx] = 0; changed++;
            }
            cur = next; if (!changed) break;
          }
        } else {
          var dark = bL < 60, athr2 = dark ? 0.02 : 0.06, gate = dark ? 0.5 : 3, dil2 = dark ? 4 : 0, boost = 1 + 6 * Math.max(0, (60 - bL) / 60);
          for (var vy = 0; vy < size; vy++) for (var rx = 0; rx < size; rx++) {
            var t2 = alpha[vy * size + rx];
            if (dil2) {
              for (var ky = -dil2; ky <= dil2; ky++) for (var kx = -dil2; kx <= dil2; kx++) {
                var yy = vy + ky, xx = rx + kx; if (xx < 0 || xx >= size || yy < 0 || yy >= size) continue;
                var av = alpha[yy * size + xx]; if (av > t2) t2 = av;
              }
            }
            if (t2 <= athr2) continue;
            var o2 = ((by + vy) * W + bx + rx) * 4;
            if (0.299 * data[o2] + 0.587 * data[o2 + 1] + 0.114 * data[o2 + 2] <= bL + gate) continue;
            var w2 = Math.min(1, t2 * boost);
            if (data[o2] > bR) data[o2] = Math.round(Math.max(bR, data[o2] - w2 * (data[o2] - bR)));
            if (data[o2 + 1] > bG) data[o2 + 1] = Math.round(Math.max(bG, data[o2 + 1] - w2 * (data[o2 + 1] - bG)));
            if (data[o2 + 2] > bB) data[o2 + 2] = Math.round(Math.max(bB, data[o2 + 2] - w2 * (data[o2 + 2] - bB)));
          }
        }
      }
      return {
        ok: true, removed: true, autoStrength: autoGain, ncc: det.ncc, box: { x: bx, y: by, size: size },
        // render({ strength, fill }): strength 1 = auto gain PLUS the adaptive cleanup (matches the
        // batch auto-download output); <1 = manual reduced reverse-blend only (so the slider visibly
        // lightens removal); >1 over-removes. fill:true instead erases the sparkle by inpainting.
        render: async function (opts) {
          opts = opts || {};
          if (opts.fill) { applyFill(); }
          else {
            var strength = (opts.strength == null ? 1 : opts.strength);
            apply(autoGain * strength);
            if (strength >= 1) cleanupResidual(); // default/full = auto-clean like the batch
          }
          ctx.putImageData(id, 0, 0);
          return await toBlobUrl();
        }
      };
    } catch (e) { return { error: (e && e.message) || String(e) }; }
  };

  // Clean a video: fetch the mp4 (same-origin, credentialed), demux (MP4Box), decode
  // each frame (WebCodecs), reverse-blend the corner logo, re-encode H.264 and re-mux
  // (mp4-muxer, audio passed through). Requires MP4Box + Mp4Muxer already injected into
  // the page. Returns { blobUrl, bytes } or { error }.
  globalThis.__inj.processVideoClean = async function (videoUrl, logoVersion) {
    // 2026 sparkle watermark templates (added alongside the originals).
    var TPL96_2026 = "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";
    var TPL48_2026 = "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";
    var SUPPORTED = ["1280x720", "720x1280", "1920x1080", "1080x1920"];
    var OPAC = [1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.34, 0.27, 0.2, 0.14];
    var MARG_48 = [144, 120, 128, 72];
    var MARG_84 = [222, 186];
    var AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
    if (typeof MP4Box === "undefined" || typeof Mp4Muxer === "undefined") return { error: "video libs not loaded" };
    if (typeof VideoDecoder === "undefined" || typeof VideoEncoder === "undefined") return { error: "WebCodecs unavailable" };
    function clamp(t, e, l) { return Math.min(Math.max(t, e), l); }

    async function decodeTpl(b64, size, withColor) {
      var bin = atob(b64), arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      var bmp = await createImageBitmap(new Blob([arr], { type: "image/png" }));
      var oc = new OffscreenCanvas(size, size), cx = oc.getContext("2d", { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0, size, size); bmp.close();
      var d = cx.getImageData(0, 0, size, size).data, v = new Float32Array(size * size);
      // withColor: the mask stores its shape in the PNG alpha channel with per-pixel
      // logo colors (the 1080p "old" paired-star mask). Otherwise it's a luma mask
      // where alpha = max(R,G,B) and the logo colour is a flat white overlay.
      var col = withColor ? new Float32Array(size * size * 3) : null;
      for (var i = 0; i < v.length; i++) {
        var p = 4 * i;
        if (withColor) { v[i] = d[p + 3] / 255; col[3 * i] = d[p]; col[3 * i + 1] = d[p + 1]; col[3 * i + 2] = d[p + 2]; }
        else { v[i] = Math.max(d[p], d[p + 1], d[p + 2]) / 255; }
      }
      return { values: v, colorValues: col || undefined, width: size, height: size };
    }

    function unblend(imgData, e) {
      var l = new Uint8ClampedArray(imgData.data), a = e.opacity !== undefined ? e.opacity : 1, n = e.ceiling != null ? e.ceiling : 1;
      var c = e.overlayValue != null ? e.overlayValue : 250, s = e.alphaMap.width, o = e.alphaMap.height;
      var hasCol = e.alphaMap.colorValues !== undefined, colv = e.alphaMap.colorValues;
      var y = e.edgeCleanup ? new Uint8Array(s * o) : null;
      for (var v = 0; v < o; v++) for (var r = 0; r < s; r++) {
        var m = v * s + r, b = Math.min(e.alphaMap.values[m] * e.baseStrength * a, n);
        if (b < 0.002) continue;
        var x = ((e.y + v) * imgData.width + e.x + r) * 4, S = 1 - b;
        if (S <= 1e-4) continue;
        if (y) y[m] = 1;
        for (var h = 0; h < 3; h++) { var ov = hasCol ? colv[3 * m + h] : c; l[x + h] = Math.round(Math.min(Math.max((imgData.data[x + h] - b * ov) / S, 0), 255)); }
      }
      if (e.edgeCleanup && y) {
        var vv = e.edgeCleanup.strength, rr = e.edgeCleanup.radius, m2 = new Uint8Array(s * o);
        for (var S2 = 0; S2 < o; S2++) for (var h2 = 0; h2 < s; h2++) if (y[S2 * s + h2])
          for (var d3 = -rr; d3 <= rr; d3++) for (var g3 = -rr; g3 <= rr; g3++) { var pp = h2 + g3, E = S2 + d3; if (pp >= 0 && pp < s && E >= 0 && E < o) m2[E * s + pp] = 1; }
        var b3 = new Uint8Array(m2), x2 = (e.edgeCleanup.maxPasses != null) ? e.edgeCleanup.maxPasses : Math.min(120, Math.max(8, s + o));
        for (var S3 = 0; S3 < x2; S3++) {
          var h3 = 0, d4 = new Uint8Array(b3);
          for (var g4 = 0; g4 < o; g4++) for (var p4 = 0; p4 < s; p4++) {
            if (!b3[g4 * s + p4]) continue;
            var E2 = 0, M = [0, 0, 0];
            for (var N = -1; N <= 1; N++) for (var C = -1; C <= 1; C++) {
              if (N === 0 && C === 0) continue;
              var D = p4 + C, G = g4 + N;
              if (D < 0 || D >= s || G < 0 || G >= o || b3[G * s + D]) continue;
              var at = ((e.y + G) * imgData.width + e.x + D) * 4; M[0] += l[at]; M[1] += l[at + 1]; M[2] += l[at + 2]; E2++;
            }
            if (E2 === 0) continue;
            var j = ((e.y + g4) * imgData.width + e.x + p4) * 4;
            for (var N2 = 0; N2 < 3; N2++) { var C2 = M[N2] / E2; l[j + N2] = Math.round(l[j + N2] * (1 - vv) + C2 * vv); }
            d4[g4 * s + p4] = 0; h3++;
          }
          b3.set(d4); if (h3 === 0) break;
        }
      }
      return new ImageData(l, imgData.width, imgData.height);
    }

    function corr(imgData, e) {
      var l = 0, a = 0, n = 0, u = 0, i = 0, c = 0;
      for (var v = 0; v < e.alphaMap.height; v++) for (var r = 0; r < e.alphaMap.width; r++) {
        var m = e.alphaMap.values[v * e.alphaMap.width + r]; if (m <= 0.08) continue;
        var b = ((e.y + v) * imgData.width + e.x + r) * 4, x = (imgData.data[b] + imgData.data[b + 1] + imgData.data[b + 2]) / 765;
        l += x; a += x * x; n += m; u += m * m; i += x * m; c++;
      }
      if (c === 0) return -Infinity;
      var s = l / c, o = n / c, y = Math.sqrt((a - c * s * s) * (u - c * o * o));
      return y <= 0 ? -Infinity : (i - c * s * o) / y;
    }

    function estOpacity(imgData, e) {
      var l = Math.max(8, Math.round(0.25 * e.alphaMap.width)), a = Math.max(0, e.x - l), n = Math.max(0, e.y - l);
      var u = Math.min(imgData.width, e.x + e.alphaMap.width + l), i = Math.min(imgData.height, e.y + e.alphaMap.height + l), c = 0, s = 0;
      for (var b = n; b < i; b++) for (var x = a; x < u; x++) {
        if (x >= e.x && x < e.x + e.alphaMap.width && b >= e.y && b < e.y + e.alphaMap.height) continue;
        var S = (b * imgData.width + x) * 4; c += 0.2126 * imgData.data[S] + 0.7152 * imgData.data[S + 1] + 0.0722 * imgData.data[S + 2]; s++;
      }
      if (s === 0) return OPAC[0];
      var o = c / s, y = OPAC[0], vbest = Infinity;
      for (var oi = 0; oi < OPAC.length; oi++) {
        var bb = OPAC[oi], xx = 0, SS = 0;
        for (var d = 0; d < e.alphaMap.height; d++) for (var g = 0; g < e.alphaMap.width; g++) {
          var p = d * e.alphaMap.width + g, E = e.alphaMap.values[p]; if (E <= 0.04) continue;
          var Mn = Math.min(E * e.baseStrength * bb, bb), jj = 1 - Mn; if (jj <= 1e-4) continue;
          var N = ((e.y + d) * imgData.width + e.x + g) * 4;
          var att = 0.2126 * ((imgData.data[N] - Mn * 250) / jj) + 0.7152 * ((imgData.data[N + 1] - Mn * 250) / jj) + 0.0722 * ((imgData.data[N + 2] - Mn * 250) / jj);
          var Nt = Math.min(1, 8 * E); xx += Math.abs(att - o) * Nt; SS += Nt;
        }
        var hh = SS > 0 ? xx / SS : Infinity; if (hh < vbest) { vbest = hh; y = bb; }
      }
      return y;
    }

    function trackDesc(file, track) {
      var l = file.getTrackById(track.id);
      var a = (l && l.mdia && l.mdia.minf && l.mdia.minf.stbl && l.mdia.minf.stbl.stsd && l.mdia.minf.stbl.stsd.entries) || [];
      for (var i = 0; i < a.length; i++) {
        var u = a[i].avcC || a[i].hvcC || a[i].vpcC || a[i].av1C; if (!u) continue;
        var DS = (typeof DataStream !== "undefined") ? DataStream : (window.DataStream || MP4Box.DataStream); if (!DS) return null;
        var cS = new DS(undefined, 0, DS.BIG_ENDIAN); u.write(cS); return new Uint8Array(cS.buffer, 8);
      }
      return null;
    }

    function demux(buf) {
      return new Promise(function (res, rej) {
        var f = MP4Box.createFile(), vs = [], as2 = [], vt = null, at = null;
        f.onError = function (err) { rej(new Error("mp4box demux: " + err)); };
        f.onReady = function (info) {
          vt = info.videoTracks && info.videoTracks[0]; at = info.audioTracks && info.audioTracks[0];
          if (!vt) { rej(new Error("no video track")); return; }
          f.setExtractionOptions(vt.id, "video", { nbSamples: 1000000 });
          if (at) f.setExtractionOptions(at.id, "audio", { nbSamples: 1000000 });
          f.start();
        };
        f.onSamples = function (id, user, samples) {
          var arr = user === "video" ? vs : as2;
          for (var i = 0; i < samples.length; i++) { var b = samples[i]; arr.push({ data: b.data.slice(0), cts: b.cts, dts: b.dts, duration: b.duration, timescale: b.timescale, is_sync: b.is_sync }); }
        };
        var s = buf.slice(0); s.fileStart = 0; f.appendBuffer(s); f.flush();
        if (!vt) { rej(new Error("no video track")); return; }
        res({ videoTrack: vt, audioTrack: at, videoSamples: vs, audioSamples: as2, videoDescription: trackDesc(f, vt) });
      });
    }

    try {
      // Same-origin (labs.google) request → session cookie is sent on the first hop;
      // the redirect to the cross-origin media host is then read without credentials
      // (a credentialed cross-origin read is rejected against wildcard CORS).
      var resp = await fetch(videoUrl, { credentials: "same-origin" });
      if (!resp.ok) return { error: "fetch HTTP " + resp.status };
      var buf = await resp.arrayBuffer();
      var dem = await demux(buf);
      var vt = dem.videoTrack, at = dem.audioTrack, vsamp = dem.videoSamples, asamp = dem.audioSamples, vdesc = dem.videoDescription;
      var W = vt.video.width, H = vt.video.height, dim = W + "x" + H;
      var nFrames = vsamp.length || 1;
      var tscale = (vsamp[0] && vsamp[0].timescale) || vt.timescale || 30000;
      var totDur = 0; for (var si = 0; si < vsamp.length; si++) totDur += vsamp[si].duration; totDur = totDur / nFrames || tscale / 30;
      var fps = Math.max(1, Math.round(tscale / totDur));
      var is1080 = (W === 1920 && H === 1080) || (W === 1080 && H === 1920);
      // 720p/1080p use their known fixed sizes + corner margins (96px @1080p, 48px @720p).
      // Any OTHER resolution (e.g. 640x360 Omni) reuses the SAME approach, scaled from the 720p
      // baseline: 360p is half of 720p, so the sparkle is ~24px at half the margins. The corr
      // candidate-scoring below still only tests the few known corner positions (so it can't
      // false-match texture), and a confidence gate + ±refine handle sub-scale drift.
      var isAuto = SUPPORTED.indexOf(dim) < 0;
      var tpls, margins;
      if (isAuto) {
        var vscale = Math.min(W, H) / 720, tsz = Math.max(12, Math.round(48 * vscale));
        tpls = [await decodeTpl(TPL96_2026, tsz, false)];
        margins = MARG_48.map(function (R) { return Math.round(R * vscale); });
      } else {
        tpls = [await decodeTpl(is1080 ? TPL96_2026 : TPL48_2026, is1080 ? 96 : 48, false)];
        margins = is1080 ? MARG_84 : MARG_48;
      }
      var cands = [];
      tpls.forEach(function (tpl) {
        margins.forEach(function (R) { cands.push({ x: clamp(W - R, 0, W - tpl.width), y: clamp(H - R, 0, H - tpl.height), alphaMap: tpl, score: 0, baseStrength: 1 }); });
      });

      var muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(), fastStart: "in-memory", firstTimestampBehavior: "offset",
        video: { codec: "avc", width: W, height: H },
        audio: at ? { codec: "aac", sampleRate: at.audio.sample_rate, numberOfChannels: at.audio.channel_count } : undefined
      });
      var bitrate = Math.max(2000000, Math.min(20000000, Math.round(W * H * fps * 0.12)));
      var encCfg = { codec: "avc1.640028", width: W, height: H, bitrate: bitrate, framerate: fps, avc: { format: "avc" } };
      var sup = await VideoEncoder.isConfigSupported(encCfg);
      if (!sup.supported) { encCfg = Object.assign({}, encCfg, { codec: "avc1.42001f" }); sup = await VideoEncoder.isConfigSupported(encCfg); if (!sup.supported) return { error: "no H.264 encoder" }; }
      var encErr = null;
      var encoder = new VideoEncoder({ output: function (chunk, meta) { muxer.addVideoChunk(chunk, meta); }, error: function (e) { encErr = e; } });
      encoder.configure(encCfg);

      var canvas = new OffscreenCanvas(W, H), cctx = canvas.getContext("2d", { willReadFrequently: true });
      var decErr = null, chosen = null, buffered = [], sampledCount = 0, encoded = 0;
      var SAMPLE = Math.min(5, nFrames), keyEvery = Math.max(1, fps * 2);

      function encodeFrame(fr) {
        var cfg = chosen || cands[0];
        var cleaned = unblend(fr.imageData, cfg);
        var init = { format: "RGBA", codedWidth: W, codedHeight: H, timestamp: fr.timestamp };
        if (fr.duration != null) init.duration = fr.duration;
        var vframe = new VideoFrame(cleaned.data.buffer, init);
        encoder.encode(vframe, { keyFrame: encoded % keyEvery === 0 }); vframe.close(); encoded++;
      }

      var decoder = new VideoDecoder({
        output: function (frame) {
          try {
            var t = frame.timestamp, d = frame.duration;
            cctx.drawImage(frame, 0, 0, W, H); frame.close();
            var idata = cctx.getImageData(0, 0, W, H);
            var rec = { imageData: idata, timestamp: t, duration: d };
            if (!chosen) {
              for (var ci = 0; ci < cands.length; ci++) cands[ci].score += corr(idata, cands[ci]);
              buffered.push(rec); sampledCount++;
              if (sampledCount >= SAMPLE) {
                // Only the corner margin varies across candidates now, so pick the
                // best-scoring position outright (erasio does the same — no version bias).
                chosen = cands.reduce(function (a, b) { return b.score > a.score ? b : a; });
                if (isAuto) {
                  // The scaled margins can be a few px off — refine ±6 around the best candidate
                  // (summed corr over the buffered frames), then gate on confidence so a wrong
                  // scale / a video with no watermark just keeps the ORIGINAL (never smears).
                  var atpl = chosen.alphaMap, asz = atpl.width, abx = chosen.x, aby = chosen.y, abs = chosen.score;
                  for (var ary = Math.max(0, chosen.y - 6); ary <= Math.min(H - asz, chosen.y + 6); ary++)
                    for (var arx = Math.max(0, chosen.x - 6); arx <= Math.min(W - asz, chosen.x + 6); arx++) {
                      var asc = 0; for (var aqi = 0; aqi < buffered.length; aqi++) asc += corr(buffered[aqi].imageData, { x: arx, y: ary, alphaMap: atpl });
                      if (asc > abs) { abs = asc; abx = arx; aby = ary; }
                    }
                  chosen.x = abx; chosen.y = aby;
                  if (!((abs / Math.max(1, buffered.length)) >= 0.35)) { decErr = new Error("no watermark found (" + dim + ")"); return; }
                }
                chosen.ceiling = 0.99;
                if (chosen.alphaMap.colorValues) {
                  // Colored alpha-channel mask (1080p old): the logo is fully opaque,
                  // un-blended against its own per-pixel colours — no opacity estimation,
                  // white overlay, or edge diffusion (matches erasio's withColor path).
                  chosen.opacity = 1;
                } else {
                  var votes = {};
                  for (var bi = 0; bi < buffered.length; bi++) { var op = estOpacity(buffered[bi].imageData, chosen); votes[op] = (votes[op] || 0) + 1; }
                  var bestOp = OPAC[0], bestN = 0;
                  for (var key in votes) { if (votes[key] > bestN) { bestN = votes[key]; bestOp = parseFloat(key); } }
                  chosen.opacity = bestOp;
                  // Luma masks: flat white overlay, then diffuse the border ring away
                  // when fully opaque (erasio's settings — 120 passes clears the fringe).
                  chosen.overlayValue = 255;
                  if (bestOp >= 1) chosen.edgeCleanup = { strength: 0.6, radius: 2, maxPasses: 120 };
                }
                for (var fi = 0; fi < buffered.length; fi++) encodeFrame(buffered[fi]);
                buffered.length = 0;
              }
              return;
            }
            encodeFrame(rec);
          } catch (err) { decErr = err; try { frame.close(); } catch (_) { } }
        },
        error: function (e) { decErr = e; }
      });
      decoder.configure({ codec: vt.codec, codedWidth: W, codedHeight: H, description: vdesc || undefined });

      for (var di = 0; di < vsamp.length; di++) {
        if (decErr) throw decErr;
        var R = vsamp[di];
        decoder.decode(new EncodedVideoChunk({ type: R.is_sync ? "key" : "delta", timestamp: R.cts * 1e6 / R.timescale, duration: R.duration * 1e6 / R.timescale, data: R.data }));
        if ((di + 1) % 24 === 0) await new Promise(function (r) { setTimeout(r, 0); });
      }
      await decoder.flush(); await encoder.flush();
      if (decErr) throw decErr; if (encErr) throw encErr;
      decoder.close(); encoder.close();

      if (at && asamp.length) {
        try {
          var sr = at.audio.sample_rate, ch = at.audio.channel_count, idx = AAC_RATES.indexOf(sr); if (idx < 0) idx = 4;
          var aMeta = { decoderConfig: { codec: "mp4a.40.2", sampleRate: sr, numberOfChannels: ch, description: new Uint8Array([(16 | idx >> 1) & 255, ((idx & 1) << 7 | ch << 3) & 255]) } };
          for (var ai = 0; ai < asamp.length; ai++) { var A = asamp[ai]; muxer.addAudioChunk(new EncodedAudioChunk({ type: "key", timestamp: A.cts * 1e6 / A.timescale, duration: A.duration * 1e6 / A.timescale, data: A.data }), aMeta); }
        } catch (ae) { /* audio copy failed → silent output */ }
      }
      muxer.finalize();
      var out = new Blob([muxer.target.buffer], { type: "video/mp4" });
      return { blobUrl: URL.createObjectURL(out), bytes: out.size };
    } catch (e) { return { error: (e && e.message) || String(e) }; }
  };

})();
