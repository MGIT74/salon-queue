/**
 * Lecteur de codes-barres / QR par la caméra (téléphone, tablette) — partagé par Mon poste et le dashboard.
 * BarcodeScanner.open({ title, tip, onCode }) ouvre un plein écran caméra ; au premier code lu, il se ferme
 * et appelle onCode(code). Lecteur intégré du navigateur (BarcodeDetector) s'il existe, sinon la petite
 * bibliothèque ZXing (/vendor), chargée seulement à ce moment-là. Nécessite https (caméra).
 */
var BarcodeScanner = (function () {
  var el = null, stream = null, timer = null, zx = null, done = null, loading = null;

  function build() {
    if (el) return el;
    var st = document.createElement('style');
    st.textContent =
      '.bcs{position:fixed;inset:0;z-index:2000;background:#000;display:none;flex-direction:column}' +
      '.bcs.on{display:flex}.bcs video{flex:1;width:100%;min-height:0;object-fit:cover}' +
      '.bcs .bcs-bar{position:absolute;left:0;right:0;top:0;padding:calc(14px + env(safe-area-inset-top,0px)) 16px 14px;display:flex;justify-content:space-between;align-items:center;color:#fff;font:600 16px/1.2 -apple-system,system-ui,sans-serif}' +
      '.bcs .bcs-x{width:44px;height:44px;border-radius:22px;border:none;background:rgba(255,255,255,.18);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
      '.bcs .bcs-frame{position:absolute;left:50%;top:45%;width:72%;max-width:340px;height:150px;transform:translate(-50%,-50%);border:3px solid #30d158;border-radius:18px;pointer-events:none}' +
      '.bcs .bcs-tip{position:absolute;left:0;right:0;bottom:calc(30px + env(safe-area-inset-bottom,0px));text-align:center;color:#d1d1d6;font:14px/1.4 -apple-system,system-ui,sans-serif;padding:0 20px}';
    document.head.appendChild(st);
    el = document.createElement('div');
    el.className = 'bcs';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<video playsinline muted autoplay></video>' +
      '<div class="bcs-bar"><span class="bcs-title"></span><button type="button" class="bcs-x" aria-label="Fermer le scanner">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="bcs-frame"></div><div class="bcs-tip"></div>';
    el.querySelector('.bcs-x').onclick = function () { close(); };
    document.body.appendChild(el);
    return el;
  }

  function loadZxing() {
    if (window.ZXing) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '/vendor/zxing-0.21.3.min.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { loading = null; reject(); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function found(code) {
    var cb = done;
    close();
    if (cb) cb(String(code || '').trim());
  }

  function fail(msg) {
    close();
    if (typeof toast === 'function') toast(msg, true);
  }

  function open(opts) {
    opts = opts || {};
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fail('Caméra indisponible sur cet appareil (ou page non sécurisée).');
      return;
    }
    build();
    close();
    done = opts.onCode || null;
    el.querySelector('.bcs-title').textContent = opts.title || 'Scanner un code-barres';
    el.querySelector('.bcs-tip').textContent = opts.tip || 'Visez le code-barres du produit';
    el.classList.add('on');
    var video = el.querySelector('video');
    if (!('BarcodeDetector' in window)) {
      loadZxing().then(function () {
        if (!el.classList.contains('on')) return;
        zx = new ZXing.BrowserMultiFormatReader();
        zx.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, function (result) {
          if (result) found(result.getText());
        }).catch(function () { fail('Caméra refusée ou indisponible.'); });
      }).catch(function () { fail('Scanner indisponible pour le moment.'); });
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
      if (!el.classList.contains('on')) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s; video.srcObject = s; video.play();
      var det = new BarcodeDetector();
      var tick = function () {
        if (!stream) return;
        det.detect(video).then(function (codes) {
          if (codes && codes.length) found(codes[0].rawValue);
          else timer = setTimeout(tick, 250);
        }).catch(function () { timer = setTimeout(tick, 400); });
      };
      tick();
    }).catch(function () { fail('Caméra refusée ou indisponible.'); });
  }

  function close() {
    clearTimeout(timer); timer = null;
    if (zx) { try { zx.reset(); } catch (e) {} zx = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (el) {
      var v = el.querySelector('video'); if (v) v.srcObject = null;
      el.classList.remove('on');
    }
    done = null;
  }

  return { open: open, close: close };
})();
