/* MBTI 즉흥 여행 · 언어 지원 (한국어 · English · 日本語 · 简体中文 · 繁體中文)
   앱 코드는 한국어로 화면을 그리고, 이 파일이 화면에 나온 한국어 문구를 고른 언어로 바꿔요.
   - 문구 사전: i18n/<언어>.json  { "t": {한국어 문구: 번역}, "e": {장소·도시 이름: 번역} }
   - 숫자와 장소·도시 이름은 자리표시({n}, {p})로 바꿔서 찾아요. 번역문에는 {0},{1}… 순서로 들어가요.
   - 사전에 없는 문구는 한국어 그대로 둬요. */
(function () {
  "use strict";
  var LANGS = [["ko", "한국어"], ["en", "English"], ["ja", "日本語"], ["zh-Hans", "简体中文"], ["zh-Hant", "繁體中文"]];
  var HTMLLANG = { ko: "ko", en: "en", ja: "ja", "zh-Hans": "zh-Hans", "zh-Hant": "zh-Hant" };
  function detect() {
    var saved = null; try { saved = localStorage.getItem("mbtiLang"); } catch (e) {}
    if (saved && HTMLLANG[saved]) return saved;
    var list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "ko"]);
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i] || "").toLowerCase();
      if (/^ko/.test(l)) return "ko";
      if (/^ja/.test(l)) return "ja";
      if (/^zh-(tw|hk|mo)|^zh-hant/.test(l)) return "zh-Hant";
      if (/^zh/.test(l)) return "zh-Hans";
      if (/^en/.test(l)) return "en";
    }
    return "en";
  }
  var LANG = detect();
  var D = null, E = null, V = null, ENT = null, ENT2 = null, MISS = {}, seg = false;
  var HANGUL = /[가-힣ㄱ-ㆎ]/;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function buildEnt() {
    var keys = Object.keys(E || {}).filter(function (k) { return HANGUL.test(k) ? k.length >= 2 : k.length >= 3; });
    keys.sort(function (a, b) { return b.length - a.length; });
    // 장소·도시 이름 | 요일 (토) | 숫자(소수·시각·쉼표 포함)
    ENT = new RegExp((keys.length ? "(" + keys.map(esc).join("|") + ")|" : "((?!))|") + "(\\((?:월|화|수|목|금|토|일)\\))|(\\d+(?:[.:,]\\d+)*)", "g");
    // 두 번째로 찾을 때: 이동 수단·숙소 위치 같은 말도 {p}로 바꿔요
    var k2 = keys.concat(Object.keys(V || {})); k2.sort(function (a, b) { return b.length - a.length; });
    ENT2 = new RegExp("(" + k2.map(esc).join("|") + ")|(\\((?:월|화|수|목|금|토|일)\\))|(\\d+(?:[.:,]\\d+)*)", "g");
  }
  function norm(core, re, vals) {
    return core.replace(re, function (all, ent, wd, num) {
      if (ent) { vals.push(E[ent] != null ? E[ent] : V[ent]); return "{p}"; }
      if (wd) { vals.push(D["{wd:" + WD[wd] + "}"] || wd); return "{w}"; }
      vals.push(num); return "{n}";
    });
  }
  var WD = { "(월)": "mon", "(화)": "tue", "(수)": "wed", "(목)": "thu", "(금)": "fri", "(토)": "sat", "(일)": "sun" };
  // {0} 그대로, {0|man} 만 단위(×10,000), {0|chun} 천 단위(×1,000) — 영어처럼 만 단위가 없는 언어용
  var MUL = { man: 10000, chun: 1000 };
  function fill(tpl, vals) {
    return tpl.replace(/\{(\d+)(?:\|(man|chun))?\}/g, function (m, i, mod) {
      var v = vals[+i]; if (v == null) return m;
      if (mod) { var x = parseFloat(String(v).replace(/,/g, "")); if (isFinite(x)) return Math.round(x * MUL[mod]).toLocaleString("en-US"); }
      return v;
    });
  }
  // 한국어 문구 하나를 번역해요. 못 찾으면 null
  function tr(s) {
    if (!D || !s || !HANGUL.test(s)) return null;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2];
    if (!core) return null;
    var hit = D[core];
    if (hit == null && E && E[core] != null) hit = E[core];
    if (hit == null) {
      var vals = [], vals2 = [];
      var key = norm(core, ENT, vals), key2 = V ? norm(core, ENT2, vals2) : key;
      if (key !== core && D[key] != null) hit = fill(D[key], vals);
      else if (key2 !== key && D[key2] != null) hit = fill(D[key2], vals2);
      else if (/\s·\s|^·\s/.test(core) && !seg) {
        // "분류 · 설명 · 가격"처럼 ' · '로 이어 붙인 문구는 조각마다 번역해요
        seg = true;
        var parts = core.split(/(\s·\s|^·\s)/), ok = true;
        for (var i = 0; i < parts.length; i++) {
          if (!parts[i] || /^(\s·\s|·\s)$/.test(parts[i]) || !HANGUL.test(parts[i])) continue;
          var tp = tr(parts[i]); if (tp == null) { ok = false; break; } parts[i] = tp;
        }
        seg = false;
        if (!ok) { MISS[core] = (MISS[core] || 0) + 1; return null; }
        hit = parts.join("");
      }
      else { MISS[core] = (MISS[core] || 0) + 1; return null; }
    }
    return m[1] + hit + m[3];
  }
  function doText(n) {
    var v = n.nodeValue; if (!v || !HANGUL.test(v)) return;
    var p = n.parentNode; if (!p || SKIP[p.nodeName] || (p.closest && p.closest("[data-noi18n]"))) return;
    var t = tr(v); if (t != null && t !== v) n.nodeValue = t;
  }
  var ATTR = ["placeholder", "aria-label", "title", "alt"];
  function doEl(el) {
    // 입력칸(textarea)의 글은 건드리지 않지만 안내 문구(placeholder)는 바꿔요
    if ((SKIP[el.nodeName] && el.nodeName !== "TEXTAREA") || (el.closest && el.closest("[data-noi18n]"))) return;
    for (var i = 0; i < ATTR.length; i++) {
      var a = el.getAttribute && el.getAttribute(ATTR[i]);
      if (a && HANGUL.test(a)) { var t = tr(a); if (t != null) el.setAttribute(ATTR[i], t); }
    }
    if ((el.nodeName === "INPUT" && (el.type === "button" || el.type === "submit")) && HANGUL.test(el.value)) { var t2 = tr(el.value); if (t2 != null) el.value = t2; }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (SKIP[root.nodeName]) { if (root.nodeName === "TEXTAREA") doEl(root); return; } doEl(root); }
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    var n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }
  var obs = null;
  function start() {
    buildEnt();
    walk(document.body);
    if (HANGUL.test(document.title)) { var t = tr(document.title); if (t) document.title = t; }
    obs = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === "characterData") doText(r.target);
        else if (r.type === "attributes") doEl(r.target);
        else for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
    document.documentElement.classList.remove("i18n-wait");
  }
  // 바깥에서 쓰는 기능: 복사 문구 번역, 언어 바꾸기, 지금 언어
  window.I18N = {
    lang: LANG, langs: LANGS,
    t: function (s) { var t = tr(s); return t == null ? s : t; },
    text: function (s) { return String(s).split("\n").map(function (l) { var t = tr(l); return t == null ? l : t; }).join("\n"); },
    name: function (s) { return (E && E[s]) || s; },
    set: function (l) { if (!HTMLLANG[l]) return; try { localStorage.setItem("mbtiLang", l); } catch (e) {} location.reload(); },
    missing: function () { return MISS; },
    ready: null
  };
  document.documentElement.lang = HTMLLANG[LANG];
  if (LANG === "ko") { document.documentElement.classList.remove("i18n-wait"); window.I18N.ready = Promise.resolve(); return; }
  window.I18N.ready = fetch("i18n/" + LANG + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (j) {
    D = j.t || {}; E = j.e || {}; V = j.v || {}; start();
  }).catch(function () { document.documentElement.classList.remove("i18n-wait"); });
  setTimeout(function () { document.documentElement.classList.remove("i18n-wait"); }, 2500);
})();
