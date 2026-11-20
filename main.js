/* kirizukon.xyz : adresse de contact, portrait tramé, nav active */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * 1. Contact : une seule constante à remplacer par la vraie adresse.
   * ------------------------------------------------------------------ */
  var MAIL = "adresse@a-definir.fr";

  function wireMail() {
    var href = "mailto:" + MAIL + "?subject=" + encodeURIComponent("Portfolio kirizukon.xyz / prise de contact");
    Array.prototype.forEach.call(document.querySelectorAll(".js-mail"), function (a) {
      a.setAttribute("href", href);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".js-mail-text"), function (s) {
      s.textContent = MAIL;
    });
  }

  /* Copie de l'adresse : presse-papier moderne, repli sur une sélection cachée. */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject();
    });
  }

  function wireCopy() {
    var btn = document.querySelector(".js-copy");
    if (!btn) return;
    var act = btn.querySelector(".copy-act");
    var say = document.querySelector(".copy-say");
    var idle = act ? act.textContent : "Copier";
    var tid;

    btn.addEventListener("click", function () {
      copyText(MAIL).then(function () {
        btn.classList.add("is-done");
        if (act) act.textContent = "Copié";
        if (say) say.textContent = "Adresse copiée";
      }, function () {
        /* presse-papier refusé : l'adresse reste lisible et sélectionnable */
        if (say) say.textContent = "Copie refusée, sélectionne l’adresse";
      });
      clearTimeout(tid);
      tid = setTimeout(function () {
        btn.classList.remove("is-done");
        if (act) act.textContent = idle;
        if (say) say.textContent = "";
      }, 3200);
    });
  }

  /* ------------------------------------------------------------------ *
   * 2. Portrait tramé : la photo passe par une grille de points.
   *    Tant qu'aucune photo n'est fournie, c'est un gabarit neutre.
   * ------------------------------------------------------------------ */
  var portraitImg = null;

  function halftone(img) {
    var cv = document.getElementById("portrait");
    if (!cv || !cv.getContext) return;

    /* la trame garde la même taille à l'œil quelle que soit la densité d'écran */
    var ratio = 200 / 440;
    var cssW = cv.clientWidth || 440;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var px = Math.max(1, Math.round(cssW * dpr));
    if (cv.width !== px) {
      cv.width = px;
      cv.height = Math.round(px * ratio);
    }

    var ctx = cv.getContext("2d");
    var W = cv.width, H = cv.height;
    var CELL = Math.max(6, Math.round(9 * (W / cssW)));
    var buf = document.createElement("canvas");
    buf.width = W; buf.height = H;
    var bx = buf.getContext("2d");

    bx.fillStyle = "#ffffff";
    bx.fillRect(0, 0, W, H);

    if (img) {
      var s = Math.max(W / img.width, H / img.height);
      var w = img.width * s, h = img.height * s;
      bx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      /* gabarit : silhouette neutre, aucune personne réelle */
      bx.fillStyle = "#8f8f8a";
      bx.beginPath();
      bx.arc(W / 2, H * 0.33, H * 0.20, 0, Math.PI * 2);
      bx.fill();
      bx.beginPath();
      bx.moveTo(W * 0.26, H * 0.99);
      bx.quadraticCurveTo(W * 0.28, H * 0.62, W / 2, H * 0.60);
      bx.quadraticCurveTo(W * 0.72, H * 0.62, W * 0.74, H * 0.99);
      bx.closePath();
      bx.fill();
    }

    var data = bx.getImageData(0, 0, W, H).data;
    ctx.clearRect(0, 0, W, H);

    for (var y = 0; y < H; y += CELL) {
      for (var x = 0; x < W; x += CELL) {
        var i = ((y + CELL / 2 | 0) * W + (x + CELL / 2 | 0)) * 4;
        var lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        var r = (1 - lum) * (CELL * 0.46);
        if (r < 0.6) {
          ctx.fillStyle = "#d2d2cc";
          r = CELL * 0.1;
        } else {
          ctx.fillStyle = "#0a0a0a";
        }
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (!img) {
      /* repères de calage : la case est une planche en attente, pas une photo */
      var t = Math.round(W * 0.045), m = Math.round(W * 0.025), lw = Math.max(1, Math.round(dpr));
      ctx.strokeStyle = "#0a0a0a";
      ctx.lineWidth = lw;
      [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(function (c) {
        ctx.beginPath();
        ctx.moveTo(c[0] + c[2] * t, c[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.lineTo(c[0], c[1] + c[3] * t);
        ctx.stroke();
      });
    }
  }

  function portrait() {
    var img = new Image();
    img.onload = function () { portraitImg = img; halftone(img); };
    img.onerror = function () { portraitImg = null; halftone(null); };
    img.src = "assets/portrait.jpg";
  }

  /* ------------------------------------------------------------------ *
   * 3. Nav : la section lue marque son entrée.
   * ------------------------------------------------------------------ */
  function spy() {
    var links = {};
    Array.prototype.forEach.call(document.querySelectorAll(".nav a[href^='#']"), function (a) {
      links[a.getAttribute("href").slice(1)] = a;
    });
    var ids = Object.keys(links);
    if (!ids.length || !("IntersectionObserver" in window)) return;

    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
      var best = null, bestV = 0;
      ids.forEach(function (id) {
        if ((seen[id] || 0) > bestV) { bestV = seen[id]; best = id; }
      });
      ids.forEach(function (id) {
        if (id === best) links[id].setAttribute("aria-current", "true");
        else links[id].removeAttribute("aria-current");
      });
    }, { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.2, 0.5, 1] });

    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  /* ------------------------------------------------------------------ *
   * 4. Démarrage.
   * ------------------------------------------------------------------ */
  function boot() {
    wireMail();
    wireCopy();
    portrait();
    spy();
  }

  var tid;
  window.addEventListener("resize", function () {
    clearTimeout(tid);
    tid = setTimeout(function () { halftone(portraitImg); }, 180);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
