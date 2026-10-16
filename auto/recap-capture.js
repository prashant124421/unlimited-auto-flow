// recap-capture.js — MAIN world, run_at: document_start.
//
// Flow's bundle (D3a) POISONS the public reCAPTCHA execute: it reads the real
// grecaptcha.enterprise.execute, saves it privately (a.ha), then REPLACES the public one with a
// wrapper that stamps every external caller's token with action "extension_hijack_detected". reCAPTCHA
// sets execute (native) and Flow wraps it in the SAME synchronous tick, so polling can't catch the
// native value. Instead we INTERCEPT the property assignments: trap window.grecaptcha →
// grecaptcha.enterprise → .execute, and record the value the FIRST time it's set to a native function.
// That native ref (window.__tatRealExecute) is the genuine execute Flow itself uses — our minting
// (inject.js getRecaptcha) calls it to get a real IMAGE_GENERATION token instead of a hijack-stamped one.
(function () {
  "use strict";
  window.__tatCaptureLoaded = true; // marker so we can confirm this script injected at document_start
  if (window.__tatRealExecute) return;

  var isNative = function (fn) {
    try { return typeof fn === "function" && Function.prototype.toString.call(fn).indexOf("[native code]") >= 0; }
    catch (_) { return false; }
  };
  var saveReal = function (ent, fn) {
    try { var b = fn.bind(ent); window.__tatRealExecute = function (k, o) { return b(k, o); }; } catch (_) {}
  };

  // Trap the `execute` property of the enterprise object: capture the native fn on first set; keep
  // the public execute NATIVE (ignore Flow's non-native poison wrapper) so external callers get the
  // real one. Flow's own code uses its privately-bound copy (a.ha), so this doesn't break Flow.
  var trapExecute = function (ent) {
    if (!ent || ent.__tatTrapped) return;
    var current;
    try { current = ent.execute; } catch (_) { current = void 0; }
    if (isNative(current)) saveReal(ent, current);
    try {
      Object.defineProperty(ent, "execute", {
        configurable: true,
        enumerable: true,
        get: function () { return current; },
        set: function (v) {
          if (isNative(v)) { current = v; saveReal(ent, v); }      // real execute → keep + capture
          else if (!isNative(current)) { current = v; }            // no native seen yet → allow
          // else: Flow's wrapper while we already hold native → IGNORE (public stays native)
        }
      });
      ent.__tatTrapped = true;
    } catch (_) { if (isNative(current)) saveReal(ent, current); }
  };

  // Trap the `enterprise` property of grecaptcha (may already exist, or be assigned later).
  var trapGre = function (gre) {
    if (!gre || gre.__tatGreTrapped) return;
    gre.__tatGreTrapped = true;
    var ent;
    try { ent = gre.enterprise; } catch (_) {}
    if (ent) { trapExecute(ent); return; }
    try {
      Object.defineProperty(gre, "enterprise", {
        configurable: true,
        enumerable: true,
        get: function () { return ent; },
        set: function (v) { ent = v; trapExecute(v); }
      });
    } catch (_) {}
  };

  if (window.grecaptcha) { trapGre(window.grecaptcha); return; }
  var g;
  try {
    Object.defineProperty(window, "grecaptcha", {
      configurable: true,
      enumerable: true,
      get: function () { return g; },
      set: function (v) { g = v; trapGre(v); }
    });
  } catch (_) {}
})();
