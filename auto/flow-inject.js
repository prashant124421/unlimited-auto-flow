// flow-inject.js — content script on flow.google.com.
//
// Adds an always-visible "Clean" pill to every image tile in the library grid.
// On click it removes the Flow watermark from that tile's image and opens a
// before/after review modal with a live "Removal strength" slider (so the user
// can dial how much of the watermark is taken out) and a Download button. Images only.
//
// Runs in the content-script isolated world. Loaded AFTER (same content_scripts
// entry, in order): vendor/wm-detect.js (defines globalThis.__wmDetect, the
// multi-scale detector) and wm.js (defines globalThis.__inj.cleanImagePrepare).
// Everything is same-origin (flow.google.com), so the image can be fetched and
// canvased without tainting — no side panel, no executeScript, no API.
(function () {
  "use strict";
  if (window.__tatFlowPillLoaded) return; // guard against double injection
  window.__tatFlowPillLoaded = true;

  // Live image inside each library image tile. Selectors are centralised here so a
  // future Flow DOM change is a one-place fix.
  var TILE_IMG_SEL = "flow-image-tile img.image[data-media-id]";

  // ---- pill injection ------------------------------------------------------

  function pillIconSvg() {
    // Sparkle glyph — matches the extension's ✦ brand mark.
    return '<svg class="tat-clean-ico" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">' +
      '<path fill="currentColor" d="M12 2l1.9 4.6L18.5 8.5 13.9 10.4 12 15l-1.9-4.6L5.5 8.5l4.6-1.9L12 2z"/>' +
      '<path fill="currentColor" d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z"/>' +
      "</svg>";
  }

  function makePill() {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tat-clean-pill";
    b.title = "Remove watermark & download (TryAIToday)";
    b.innerHTML = pillIconSvg() + '<span class="tat-clean-lbl">Clean</span>';
    b.addEventListener("click", onPillClick);
    return b;
  }

  // Add one pill per image tile that doesn't already have one. Checking for an
  // existing pill (rather than a marker attribute) self-heals if Angular's virtual
  // scroll recycles a tile and drops our node.
  function decorate() {
    var imgs = document.querySelectorAll(TILE_IMG_SEL);
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var box = img.closest(".container.mobile") || img.parentElement;
      if (!box || box.querySelector(":scope > .tat-clean-pill")) continue;
      if (getComputedStyle(box).position === "static") box.style.position = "relative";
      box.appendChild(makePill());
    }
  }

  // Debounced observer over the whole document — survives SPA route changes and
  // virtual-scroll mounts. Coalesced to one pass per animation frame.
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; decorate(); });
  }
  var mo = new MutationObserver(schedule);
  mo.observe(document.documentElement, { childList: true, subtree: true });
  decorate();

  // ---- click → prepare → modal --------------------------------------------

  function sanitize(s) {
    return String(s || "").trim().replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "flow-image";
  }

  async function onPillClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var pill = e.currentTarget;
    if (pill.classList.contains("tat-busy")) return;

    // Read the tile's CURRENT image at click time — defends against virtual-scroll
    // recycling reusing this element for a different image.
    var tile = pill.closest("flow-image-tile");
    var img = tile && tile.querySelector("img.image[data-media-id]");
    if (!img) return;
    var orig = img.currentSrc || img.src;
    var labelEl = tile.querySelector(".footer-title");
    var label = sanitize((labelEl && labelEl.textContent) || img.getAttribute("data-media-id"));

    openModal(orig, label);

    if (!globalThis.__inj || typeof globalThis.__inj.cleanImagePrepare !== "function") {
      setError("watermark remover not loaded");
      return;
    }

    pill.classList.add("tat-busy");
    try {
      var h = await globalThis.__inj.cleanImagePrepare(orig);
      if (!h || h.error) { setError((h && h.error) || "unknown error"); return; }
      await setHandle(h);
    } catch (err) {
      setError((err && err.message) || String(err));
    } finally {
      pill.classList.remove("tat-busy");
    }
  }

  // ---- review modal --------------------------------------------------------

  var modal, elImg, elBadge, elNote, elDownload, elBefore, elAfter, elSpinner,
    elStrengthRow, elRange, elRangeVal, elFill;
  var curOrig = null, curAfter = null, curLabel = "flow-image", curSide = "after";
  var handle = null, rendering = false, pendingRender = false;
  var curPct = 100, fillMode = false;

  function buildModal() {
    modal = document.createElement("div");
    modal.className = "tat-modal-backdrop";
    modal.innerHTML =
      '<div class="tat-modal" role="dialog" aria-modal="true" aria-label="Watermark removal">' +
        '<div class="tat-head">' +
          '<div class="tat-headleft">' +
            '<span class="tat-badge" hidden>&#10003; Clean</span>' +
            '<span class="tat-title">Watermark removal</span>' +
          "</div>" +
          '<button type="button" class="tat-x" aria-label="Close">&#10005;</button>' +
        "</div>" +
        '<div class="tat-stage">' +
          '<div class="tat-spinner" aria-label="Cleaning"></div>' +
          '<img class="tat-preview" alt="preview" hidden />' +
        "</div>" +
        '<div class="tat-note" hidden></div>' +
        '<div class="tat-strength" hidden>' +
          '<div class="tat-strength-head">' +
            '<span class="tat-strength-lbl">Removal strength</span>' +
            '<span class="tat-strength-val">100%</span>' +
          "</div>" +
          '<input type="range" class="tat-range" min="0" max="200" value="100" step="1" ' +
            'aria-label="Removal strength" />' +
          '<label class="tat-fill-row"><input type="checkbox" class="tat-fill" /> ' +
            '<span>Erase leftover (fill from surroundings)</span></label>' +
          '<div class="tat-strength-hint">Drag for more/less removal, or tick Erase if a faint mark remains, then download.</div>' +
        "</div>" +
        '<div class="tat-foot">' +
          '<div class="tat-toggle">' +
            '<button type="button" class="tat-seg tat-before">Before</button>' +
            '<button type="button" class="tat-seg tat-after tat-on">After</button>' +
          "</div>" +
          '<button type="button" class="tat-download" disabled>Download</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(modal);
    elImg = modal.querySelector(".tat-preview");
    elBadge = modal.querySelector(".tat-badge");
    elNote = modal.querySelector(".tat-note");
    elDownload = modal.querySelector(".tat-download");
    elBefore = modal.querySelector(".tat-before");
    elAfter = modal.querySelector(".tat-after");
    elSpinner = modal.querySelector(".tat-spinner");
    elStrengthRow = modal.querySelector(".tat-strength");
    elRange = modal.querySelector(".tat-range");
    elRangeVal = modal.querySelector(".tat-strength-val");
    elFill = modal.querySelector(".tat-fill");
    modal.querySelector(".tat-x").addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    elBefore.addEventListener("click", function () { showSide("before"); });
    elAfter.addEventListener("click", function () { showSide("after"); });
    elDownload.addEventListener("click", doDownload);
    elRange.addEventListener("input", function () {
      curPct = parseInt(elRange.value, 10) || 0;
      elRangeVal.textContent = curPct + "%";
      if (fillMode) { fillMode = false; elFill.checked = false; } // dragging returns to blend mode
      elRange.disabled = false;
      showSide("after");   // so the change is visible while dragging
      rerender();
    });
    elFill.addEventListener("change", function () {
      fillMode = elFill.checked;
      elRange.disabled = fillMode; // strength doesn't apply while erasing
      showSide("after");
      rerender();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("tat-open")) closeModal();
    });
  }

  function openModal(orig, label) {
    if (!modal) buildModal();
    releaseAfter();
    handle = null;
    curOrig = orig; curLabel = label;
    curPct = 100; fillMode = false;
    elBadge.hidden = true;
    elNote.hidden = true; elNote.textContent = "";
    elStrengthRow.hidden = false; // reserve its space up front so the image doesn't jump when it appears
    elRange.value = "100"; elRangeVal.textContent = "100%"; elRange.disabled = false;
    if (elFill) elFill.checked = false;
    elImg.hidden = true; elImg.removeAttribute("src"); // drop the previous image so it can't flash
    elSpinner.hidden = false;
    elDownload.disabled = true;
    setSeg("after"); curSide = "after";
    modal.classList.add("tat-open");
  }

  // Received a prepared handle: render at the default strength and, when a watermark was
  // found, reveal the strength slider + Erase toggle.
  async function setHandle(h) {
    handle = h;
    elSpinner.hidden = false;
    if (h.removed) {
      elBadge.hidden = false;
      elNote.hidden = true;
      elStrengthRow.hidden = false;
    } else {
      elBadge.hidden = true;
      elNote.hidden = false;
      elNote.textContent = "No watermark found — you can still download the image.";
      elStrengthRow.hidden = true;
    }
    await rerender();
  }

  // Re-render from the current controls (strength slider + Erase toggle). Serialised:
  // while a render is running, one more pass is queued so the latest state wins.
  async function rerender() {
    if (!handle || typeof handle.render !== "function") return;
    if (rendering) { pendingRender = true; return; }
    rendering = true;
    try {
      var url = await handle.render(fillMode ? { fill: true } : { strength: curPct / 100 });
      releaseAfter();
      curAfter = url;
      elSpinner.hidden = true;
      elImg.hidden = false;
      elDownload.disabled = !url;
      if (curSide === "after" && url) elImg.src = url;
    } catch (err) {
      setError((err && err.message) || String(err));
    } finally {
      rendering = false;
      if (pendingRender) { pendingRender = false; rerender(); }
    }
  }

  function setError(msg) {
    elSpinner.hidden = true;
    elImg.hidden = true;
    elBadge.hidden = true;
    elStrengthRow.hidden = true;
    elNote.hidden = false;
    elNote.textContent = "Couldn't clean this image: " + msg;
    elDownload.disabled = true;
  }

  function setSeg(side) {
    elBefore.classList.toggle("tat-on", side === "before");
    elAfter.classList.toggle("tat-on", side === "after");
  }

  function showSide(side) {
    curSide = side;
    setSeg(side);
    var src = side === "before" ? curOrig : (curAfter || curOrig);
    if (src) { elImg.src = src; elImg.hidden = false; }
  }

  function doDownload() {
    if (!curAfter) return;
    var a = document.createElement("a");
    a.href = curAfter;
    a.download = (curLabel || "flow-image") + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function releaseAfter() {
    if (curAfter) { try { URL.revokeObjectURL(curAfter); } catch (_) {} curAfter = null; }
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("tat-open");
    releaseAfter();
    handle = null;
    pendingRender = false;
  }
})();
