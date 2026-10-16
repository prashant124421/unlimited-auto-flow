// inject.js — helpers executed inside the Flow page via
// chrome.scripting.executeScript({ world: 'MAIN', func }), exposed on globalThis.__inj.
//
// Constraints:
// - Must stay un-obfuscated (the production build copies this file verbatim).
//   executeScript stringifies each function and runs it in the Flow page, which
//   has none of the bundle's scope; an obfuscated body would reference runtime
//   helpers (string-array decoder, etc.) that don't exist there.
// - Each function is self-contained and receives all inputs via parameters
//   (executeScript cannot capture closures).
(function () {
  globalThis.__inj = {
    // Flow session access token.
    getToken: async () => {
      // labs.google returns a Bearer access_token here (used for the old REST API).
      for (const p of ['/fx/api/auth/session', '/api/auth/session']) {
        try { const j = await (await fetch(p, { credentials: 'include' })).json(); if (j && j.access_token) return j.access_token; } catch (_) {}
      }
      // The new flow.google.com app has NO Bearer token — it authorises via cookies + the
      // batchexecute `at` token. Return that as a "signed-in" indicator so the panel's token
      // gates pass; generation on the new app uses batchexecute, not this value.
      try { const at = (window.WIZ_global_data || {}).SNlM0e; if (at) return at; } catch (_) {}
      return null;
    },

    // The Google account currently logged into the Flow tab.
    getFlowEmail: async () => {
      // New flow.google.com exposes the account on the page (no JSON /auth/session).
      try { const w = window.WIZ_global_data || {}; if (w.oPEP7c) return w.oPEP7c; } catch (_) {}
      for (const p of ['/fx/api/auth/session', '/api/auth/session']) {
        try { const s = await (await fetch(p, { credentials: 'include' })).json(); const e = (s && s.user && s.user.email) || (s && s.email); if (e) return e; } catch (_) {}
      }
      return null;
    },

    // The Flow account signed into the page: stable gaia id + email, read from
    // WIZ_global_data (S06Grb = gaia id, oPEP7c = email). Used to enforce the per-license
    // Flow-account cap — the license id_token's `sub` is the SAME gaia id, so a Flow account
    // whose gaiaId === owner.sub is the purchase account (the always-allowed pinned slot).
    getFlowAccount: () => {
      try { const w = window.WIZ_global_data || {}; return { gaiaId: w.S06Grb || null, email: w.oPEP7c || null }; }
      catch (_) { return { gaiaId: null, email: null }; }
    },

    // Project id from the Flow tab URL.
    getProjectId: () => { const m = location.href.match(/project\/([a-f0-9-]+)/); return m ? m[1] : null; },

    // Is reCAPTCHA Enterprise initialized on the page yet?
    recaptchaReady: () => !!(window.grecaptcha && window.grecaptcha.enterprise),

    // Run a reCAPTCHA Enterprise action → token.
    // ENCAPSULATED CALL: invoke execute() from a detached macrotask (setTimeout trampoline) so that
    // at the moment of the call the synchronous stack contains only the browser's timer runner — none
    // of our injected/executeScript frames. This tests whether extension_hijack_detected is driven by
    // reCAPTCHA inspecting the caller's stack trace (an injected frame → flagged token).
    getRecaptcha: (key, action) => {
      // Flow POISONS the public grecaptcha.enterprise.execute so external callers get a token stamped
      // action "extension_hijack_detected" (see D3a in Flow's bundle). recap-capture.js grabs the REAL
      // native execute before Flow wraps it → window.__tatRealExecute. Prefer that so we mint a genuine
      // IMAGE_GENERATION token like Flow's own code does. Fall back to the public execute if not captured.
      const real = window.__tatRealExecute;
      const pub = window.grecaptcha && window.grecaptcha.enterprise && window.grecaptcha.enterprise.execute
        && window.grecaptcha.enterprise.execute.bind(window.grecaptcha.enterprise);
      const run = (typeof real === "function") ? real : pub;
      if (typeof run !== "function") return null;
      return new Promise((resolve) => {
        setTimeout(function () {
          let out;
          try { out = run(key, { action }); } catch (_) { resolve(null); return; }
          Promise.resolve(out).then(resolve, function () { resolve(null); });
        }, 0);
      });
    },
    // Diagnostics: did we capture the real execute, and is the public one poisoned?
    recapStatus: () => {
      var out = { realCaptured: typeof window.__tatRealExecute === "function", publicPoisoned: null };
      try {
        var e = window.grecaptcha && window.grecaptcha.enterprise && window.grecaptcha.enterprise.execute;
        out.publicPoisoned = e ? (Function.prototype.toString.call(e).indexOf("[native code]") < 0) : null;
      } catch (_) {}
      return out;
    },

    // ---- flow.google.com transport ------------------------------------------
    // The new Flow app (flow.google.com) doesn't use the old Bearer-token REST API.
    // Every server call goes to ONE endpoint (batchexecute), identified by an
    // obfuscated `rpcid`, authorised by cookies + an XSRF token from the page's
    // WIZ_global_data. This is the generic transport; WHICH rpcid maps to which
    // operation lives in the FLOW_RPC registry in sidepanel.js (+ docs/flow-rpc-map.md).
    // rpcid = the method id; argsJson = JSON string of that method's args array.
    // Returns { ok, data } (data = parsed result payload) or { error }.
    batchexecute: async (rpcid, argsJson, sourcePath) => {
      try {
        const w = window.WIZ_global_data || {};
        const at = w.SNlM0e;                       // XSRF / anti-forgery token
        if (!at) return { error: 'no at token (WIZ_global_data.SNlM0e missing)' };
        const bl = w.cfb2h || '';                  // app build label
        const fsid = w.FdrFJe || '';               // session id
        const hl = w.NsqkG || document.documentElement.lang || 'en';
        // source-path MUST match the page context Google expects for the op. The real Flow page
        // sends the CURRENT path (e.g. /project/<id>) on every batchexecute; a project-scoped op
        // (generation, media) sent from source-path=/ is treated as out-of-context and rejected
        // with PUBLIC_ERROR_UNUSUAL_ACTIVITY (HAR-verified: only the "/" generation calls failed,
        // the "/project/<id>" ones succeeded). Callers pass the project path for those ops; anything
        // else falls back to the tab's actual location.pathname (what the page itself would send).
        const sp = sourcePath || location.pathname || '/';
        const freq = JSON.stringify([[[rpcid, argsJson, null, 'generic']]]);
        const qs = 'rpcids=' + encodeURIComponent(rpcid) + '&source-path=' + encodeURIComponent(sp) + '&bl=' + encodeURIComponent(bl) +
          '&f.sid=' + encodeURIComponent(fsid) + '&hl=' + encodeURIComponent(hl) +
          '&_reqid=' + (Math.floor(Math.random() * 900000) + 100000) + '&rt=c';
        const body = 'f.req=' + encodeURIComponent(freq) + '&at=' + encodeURIComponent(at) + '&';
        // Google multi-login: when signed into >1 account the page path carries an account
        // index (/u/1/, /u/2/, …). The batchexecute endpoint is account-scoped, so it MUST
        // carry the same prefix — else a secondary-account session (/u/1/) would call account 0
        // and mismatch its SNlM0e token/cookies (401/403 or wrong-account op). Primary account
        // has no prefix, so this is a no-op there.
        const um = location.pathname.match(/^\/u\/(\d+)\//);
        const base = location.origin + (um ? '/u/' + um[1] : '');
        // Invoke the PAGE's own fetch (not a bound/wrapped copy). We previously bounced through a
        // setTimeout(0) "macrotask trampoline" to detach from the executeScript call stack, but HAR
        // confirmed Flow does NOT monitor fetch, so it was unnecessary — and in a BACKGROUND (hidden)
        // tab that timer gets throttled (up to ~1/min), stalling generation. Removed so parallel runs
        // in background windows keep pace (paired with the side-panel keep-awake tone).
        const pageFetch = window.fetch;
        // Abortable so Stop halts an in-flight call immediately (registered in the shared set that
        // __inj.abort drains). Without this, Stop had to wait for the whole request to finish.
        const ac = new AbortController();
        (window.__injAborters || (window.__injAborters = new Set())).add(ac);
        let r;
        try {
          r = await pageFetch.call(window, base + '/_/AiSandboxAngularFrontend/data/batchexecute?' + qs, {
            method: 'POST', credentials: 'include', signal: ac.signal,
            // X-Same-Domain: 1 is the same-origin/CSRF marker the Flow page itself sends on every
            // batchexecute. The 2026-09-22 frontend build began REJECTING calls without it —
            // generation returned HTTP 200 + PUBLIC_ERROR_UNUSUAL_ACTIVITY on every request (the
            // panel then read that as an abuse gate and cooled down). HAR-verified: the only header
            // difference between a working manual generation and ours was this one.
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Same-Domain': '1' }, body,
          });
        } catch (e) { return { error: e.name === 'AbortError' ? 'aborted' : e.message, aborted: e.name === 'AbortError' }; }
        finally { try { window.__injAborters.delete(ac); } catch (_) {} }
        if (!r.ok) return { error: 'HTTP ' + r.status };
        const txt = await r.text();
        // Response: )]}' prefix, then length-prefixed lines each a JSON array. The row
        // ["wrb.fr", <rpcid>, <result-as-json-string>, ...] carries our result.
        let data = null, rpcErr = null;
        for (const line of txt.replace(/^\)\]\}'/, '').split('\n')) {
          const s = line.trim();
          if (!s || s[0] !== '[') continue;
          let arr; try { arr = JSON.parse(s); } catch (_) { continue; }
          const rows = Array.isArray(arr[0]) ? arr : [arr];
          for (const row of rows) {
            if (row[0] === 'wrb.fr' && row[1] === rpcid) {
              if (row[2] != null) { try { data = JSON.parse(row[2]); } catch (_) { data = row[2]; } }
              // HTTP 200 does NOT mean success: a rejected op returns null data with the error in
              // row[5] (e.g. [7,null,[["…ErrorInfo",["PUBLIC_ERROR_UNUSUAL_ACTIVITY"]]]]). Surface it.
              else if (row[5]) { rpcErr = 'rpc ' + JSON.stringify(row[5]).slice(0, 220); }
            }
            else if (row[0] === 'er') { rpcErr = row[2] || 'rpc error'; }
          }
        }
        if (data == null && rpcErr) return { error: 'rpc: ' + JSON.stringify(rpcErr).slice(0, 200) };
        return { ok: true, data, raw: data == null ? txt.replace(/^\)\]\}'/, '').replace(/\s+/g, ' ').slice(0, 300) : undefined };
      } catch (e) { return { error: e.message }; }
    },

    // POST batchGenerateImages (u=url, b=body json, t=token). Abortable via __inj.abort
    // (the controller's abort is parked on the page's window so a separate exec can call it).
    generate: async (u, b, t) => {
      const ac = new AbortController();
      (window.__injAborters || (window.__injAborters = new Set())).add(ac);
      try {
        const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Authorization': 'Bearer ' + t }, credentials: 'include', body: b, signal: ac.signal });
        const txt = await r.text();
        if (!r.ok) return { error: 'HTTP ' + r.status, status: r.status, errText: txt.slice(0, 400) };
        try { return { ok: true, data: JSON.parse(txt) }; } catch { return { ok: true, data: null }; }
      } catch (e) { return { error: e.name === 'AbortError' ? 'aborted' : e.message, aborted: e.name === 'AbortError' }; }
      finally { try { window.__injAborters.delete(ac); } catch (_) {} }
    },

    // Abort every in-flight fetch (batchexecute + generate) — called on Stop for an immediate halt.
    abort: () => { try { const s = window.__injAborters; if (s) { for (const ac of s) { try { ac.abort(); } catch (_) {} } s.clear(); } } catch (_) {} },

    // POST uploadImage (reference image) (u=url, b=body json, t=token) → media name.
    upload: async (u, b, t) => {
      try {
        const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Authorization': 'Bearer ' + t }, credentials: 'include', body: b });
        const txt = await r.text();
        if (!r.ok) return { error: 'HTTP ' + r.status, errText: txt.slice(0, 300) };
        try { const j = JSON.parse(txt); return { ok: true, name: j && j.media && j.media.name }; } catch { return { error: 'parse' }; }
      } catch (e) { return { error: e.message }; }
    },

    // Read the signed-in Flow account's paygate tier (key = Flow's public API key).
    // Returns { tier: 'PAYGATE_TIER_*'|null } — used to gate Ultra-only features (4K).
    getTier: async (key) => {
      try {
        let token = null; // /fx/api on labs.google, /api on flow.google.com
        for (const p of ['/fx/api/auth/session', '/api/auth/session']) { try { const j = await (await fetch(p, { credentials: 'include' })).json(); if (j && j.access_token) { token = j.access_token; break; } } catch (_) {} }
        if (token) {
          // labs.google — the Bearer REST API. A transient failure is an error (not "non-Ultra").
          const r = await fetch('https://aisandbox-pa.googleapis.com/v1/credits?key=' + encodeURIComponent(key), { headers: { Authorization: 'Bearer ' + token } });
          if (r.ok) { const j = await r.json(); return { tier: (j && j.userPaygateTier) || null, sku: (j && j.sku) || null }; }
          return { error: 'HTTP ' + r.status };
        }
        // flow.google.com has no Bearer token. The plan isn't in the page HTML (it's runtime
        // state from an Angular service), but the app reports it to analytics — GTM/gtag carries
        // `paygate_tier` (e.g. "paygate_tier_two" for Ultra, "paygate_tier_one" for Pro), which
        // lives in window.dataLayer. Read it there (HAR-verified). Map to the PAYGATE_TIER_* enum.
        let hay = '';
        try { if (self.dataLayer) hay += JSON.stringify(self.dataLayer); } catch (_) {}
        try { if (self.google_tag_data) hay += JSON.stringify(self.google_tag_data); } catch (_) {}
        try { if (self.WIZ_global_data) hay += JSON.stringify(self.WIZ_global_data); } catch (_) {}
        const two = /paygate_tier_two|PAYGATE_TIER_TWO/i.test(hay);
        const one = /paygate_tier_one|PAYGATE_TIER_ONE/i.test(hay);
        const none = /paygate_tier_(?:not_paid|zero|unsubscribed)|PAYGATE_TIER_(?:NOT_PAID|ZERO|UNSUBSCRIBED)/i.test(hay);
        if (two) return { tier: 'PAYGATE_TIER_TWO', source: 'dataLayer' };
        if (one) return { tier: 'PAYGATE_TIER_ONE', source: 'dataLayer' };
        if (none) return { tier: 'PAYGATE_TIER_NOT_PAID', source: 'dataLayer' };
        return { tier: null, source: 'dataLayer' }; // not yet reported → unknown
      } catch (e) { return { error: e.message }; }
    },

    // Does Flow stamp a VISIBLE watermark on this account's generations?
    // appConfig.isWatermarkForceEnabled forces it on (region/age policy); otherwise the
    // user's userSettings.isWatermarkEnabledByUser decides (absent → default on). So an
    // image is watermark-free ONLY when force is off AND the user explicitly turned it
    // off — those are the accounts our removal step would "burn", so the panel disables
    // removal when present=false. Returns { ok, present, force, userEnabled } or { error }.
    getWatermarkSetting: async () => {
      try {
        let token = null; // /fx/api on labs.google, /api on flow.google.com
        for (const p of ['/fx/api/auth/session', '/api/auth/session']) { try { const j = await (await fetch(p, { credentials: 'include' })).json(); if (j && j.access_token) { token = j.access_token; break; } } catch (_) {} }
        if (!token) return { error: 'no token' };
        const opt = { headers: { Authorization: 'Bearer ' + token }, credentials: 'include' };
        const cfgRes = await fetch('https://aisandbox-pa.googleapis.com/v1/flow/appConfig', opt);
        if (!cfgRes.ok) return { error: 'appConfig HTTP ' + cfgRes.status };
        const cfg = await cfgRes.json();
        const force = !!(cfg && cfg.isWatermarkForceEnabled);
        let userEnabled; // undefined = never set by the user
        if (!force) {
          try {
            const us = await (await fetch('https://aisandbox-pa.googleapis.com/v1/flow/userSettings', opt)).json();
            userEnabled = us ? us.isWatermarkEnabledByUser : undefined;
          } catch (_) {}
        }
        const present = force || userEnabled !== false;
        return { ok: true, present, force, userEnabled: userEnabled === undefined ? null : !!userEnabled };
      } catch (e) { return { error: e.message }; }
    },

    // Read the project's image media (pid=projectId). By default only user-uploaded
    // images; with incGen=true also include generated images (each item carries a
    // `generated` flag). Video media (m.video) is always excluded.
    fetchMedia: async (pid, incGen) => {
      try {
        const input = encodeURIComponent(JSON.stringify({ json: { projectId: pid } }));
        let r = null; // /fx/api/trpc on labs.google, /api/trpc on flow.google.com
        for (const base of ['/fx/api/trpc', '/api/trpc']) { try { const rr = await fetch(base + '/flow.projectInitialData?input=' + input, { credentials: 'include' }); if (rr.ok) { r = rr; break; } } catch (_) {} }
        if (!r || !r.ok) return { error: r ? 'HTTP ' + r.status : 'no response' };
        const j = await r.json();
        const json = j && j.result && j.result.data && j.result.data.json;
        const media = (json && json.projectContents && json.projectContents.media) || [];
        const items = media
          .filter((m) => {
            if (!m || !m.name || !m.image) return false; // images only (skip m.video)
            if (m.image.userUploadedImage) return true;
            return !!(incGen && m.image.generatedImage);
          })
          .map((m) => ({ mediaId: m.name, createTime: (m.mediaMetadata && m.mediaMetadata.createTime) || '', generated: !(m.image && m.image.userUploadedImage) }));
        items.sort((a, b) => (b.createTime || '').localeCompare(a.createTime || '')); // newest first
        return { items };
      } catch (e) { return { error: e.message }; }
    },

    // Read the project's named workflows (pid=projectId) → [{ handle, mediaId, createTime }].
    // Names live on workflows (metadata.displayName), not on raw media, so we scan every
    // array in projectContents for workflow-shaped objects (robust to exact key naming).
    fetchWorkflows: async (pid) => {
      try {
        const input = encodeURIComponent(JSON.stringify({ json: { projectId: pid } }));
        let r = null; // /fx/api/trpc on labs.google, /api/trpc on flow.google.com
        for (const base of ['/fx/api/trpc', '/api/trpc']) { try { const rr = await fetch(base + '/flow.projectInitialData?input=' + input, { credentials: 'include' }); if (rr.ok) { r = rr; break; } } catch (_) {} }
        if (!r || !r.ok) return { error: r ? 'HTTP ' + r.status : 'no response' };
        const j = await r.json();
        const root = j && j.result && j.result.data && j.result.data.json && j.result.data.json.projectContents;
        const out = [], archived = [];
        const scan = (arr) => {
          if (!Array.isArray(arr)) return;
          for (const w of arr) {
            const md = w && w.metadata;
            if (!md || !md.displayName || !md.primaryMediaId) continue;
            if (md.archived) { archived.push(md.primaryMediaId); continue; } // trashed → not a valid reference
            out.push({ handle: md.displayName, mediaId: md.primaryMediaId, createTime: md.createTime || md.updateTime || '' });
          }
        };
        if (root) for (const k of Object.keys(root)) scan(root[k]);
        return { items: out, archived };
      } catch (e) { return { error: e.message }; }
    },

    // Rename a workflow's displayName (wfId=workflowId, proj=projectId, name, tok=token).
    renameWorkflow: async (wfId, proj, name, tok) => {
      try {
        const body = JSON.stringify({ workflow: { name: wfId, projectId: proj, metadata: { displayName: name } }, updateMask: 'metadata.displayName' });
        const r = await fetch('https://aisandbox-pa.googleapis.com/v1/flowWorkflows/' + wfId, {
          method: 'PATCH', headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Authorization': 'Bearer ' + tok }, credentials: 'include', body
        });
        const txt = await r.text();
        if (!r.ok) return { error: 'HTTP ' + r.status, errText: txt.slice(0, 200) };
        return { ok: true };
      } catch (e) { return { error: e.message }; }
    },

    // Image upscale (key=site key, mId=mediaId, proj=projectId, tok=token, res='2k'|'4k').
    // 4K requires a Google AI Ultra account (PAYGATE_TIER_TWO); 2K is available to all.
    upsample: async (key, mId, proj, tok, res) => {
      try {
        const is4k = res === '4k';
        // Use the REAL execute captured before Flow poisoned the public one (recap-capture.js);
        // fall back to the public execute (kept native by the interception) if not captured.
        const _run = window.__tatRealExecute
          || (window.grecaptcha && window.grecaptcha.enterprise && window.grecaptcha.enterprise.execute
              && window.grecaptcha.enterprise.execute.bind(window.grecaptcha.enterprise));
        const rc = _run ? await _run(key, { action: 'IMAGE_GENERATION' }) : null;
        if (!rc) return { error: 'no recaptcha' };
        const body = JSON.stringify({
          mediaId: mId,
          targetResolution: is4k ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K',
          clientContext: {
            projectId: proj, tool: 'PINHOLE',
            recaptchaContext: { applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB', token: rc },
            sessionId: ';' + Date.now() + Math.random().toString(36).slice(2),
            userPaygateTier: is4k ? 'PAYGATE_TIER_TWO' : 'PAYGATE_TIER_NOT_PAID'
          }
        });
        const r = await fetch('https://aisandbox-pa.googleapis.com/v1/flow/upsampleImage', {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Authorization': 'Bearer ' + tok }, credentials: 'include', body
        });
        const txt = await r.text();
        if (!r.ok) return { error: 'HTTP ' + r.status, status: r.status, errText: txt.slice(0, 300) };
        let enc; try { enc = JSON.parse(txt).encodedImage; } catch { return { error: 'parse' }; }
        if (!enc) return { error: 'no encodedImage' };
        const bin = atob(enc);
        const a = new Uint8Array(bin.length);
        for (let n = 0; n < bin.length; n++) a[n] = bin.charCodeAt(n);
        return { ok: true, blobUrl: URL.createObjectURL(new Blob([a], { type: 'image/png' })) };
      } catch (e) { return { error: e.message }; }
    },

    // Turn base64 image bytes into a same-context blob: URL (b64, mime). Used by the new
    // flow.google.com upscale, whose batchexecute reply returns the upscaled PNG inline.
    blobFromB64: (b64, mime) => {
      try {
        const bin = atob(b64);
        const a = new Uint8Array(bin.length);
        for (let n = 0; n < bin.length; n++) a[n] = bin.charCodeAt(n);
        return { ok: true, blobUrl: URL.createObjectURL(new Blob([a], { type: mime || 'image/png' })) };
      } catch (e) { return { error: e.message }; }
    },

    // Load an image in-page and return a same-context blob: URL (u=url).
    toBlobUrl: (u) => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          c.toBlob((b) => resolve(b ? { blobUrl: URL.createObjectURL(b) } : { error: 'toBlob null' }), 'image/jpeg', 0.95);
        } catch (e) { resolve({ error: e.message }); }
      };
      img.onerror = () => resolve({ error: 'image load failed' });
      img.src = u;
    }),

    // Load an image in-page and return its bytes as a base64 PNG string (u = url,
    // may be a blob: URL). Lets the side panel pull generated images in to build a
    // zip — a direct fetch from the extension would hit the CDN's CORS block.
    urlToB64: (u) => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ b64: c.toDataURL('image/png').split(',')[1] });
        } catch (e) { resolve({ error: e.message }); }
      };
      img.onerror = () => resolve({ error: 'image load failed' });
      img.src = u;
    }),

    // Fetch any URL (incl. a blob: URL) in-page and return its bytes as base64.
    // Used to pull cleaned/raw VIDEO bytes into the side panel for zipping (images
    // use urlToB64/canvas; videos can't, so we fetch the bytes directly).
    bytesB64: async (u) => {
      try {
        const r = await fetch(u, { credentials: 'include' });
        if (!r.ok) return { error: 'HTTP ' + r.status };
        const buf = new Uint8Array(await r.arrayBuffer());
        let s = ''; const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) s += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
        return { b64: btoa(s), size: buf.length };
      } catch (e) { return { error: e.message }; }
    },

    // Fetch an image URL in-page and return it as a full `data:<mime>;base64,…` URL (u=url).
    // The Library thumbnails live on flow.google.com/asb/<token> (and the fife host), whose
    // responses carry Cross-Origin-Resource-Policy: same-site — so the extension origin can't
    // render them directly (200 but the body is withheld → broken <img>). Fetched here, inside
    // the Flow page, the request is same-site + credentialed, so it succeeds; the resulting
    // data: URL has no origin restriction and renders anywhere. Preserves the original mime
    // (webp) via Blob, unlike urlToB64's canvas re-encode.
    imgDataUrl: async (u) => {
      try {
        const r = await fetch(u, { credentials: 'include' });
        if (!r.ok) return { error: 'HTTP ' + r.status };
        const blob = await r.blob();
        const dataUrl = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => rej(fr.error || new Error('read failed'));
          fr.readAsDataURL(blob);
        });
        return { dataUrl };
      } catch (e) { return { error: e.message }; }
    },

    // Free a previously created blob: URL (u=url).
    revoke: (u) => { try { URL.revokeObjectURL(u); } catch (_) {} }
  };
})();
