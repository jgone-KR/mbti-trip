// MBTI 즉흥 여행 · Supabase 연결 코드
// config.js 에 주소와 키가 들어 있으면 서버 모드로 동작하고, 비어 있으면 휴대폰 저장 모드로 동작해요.
(function () {
  var C = window.TRIP_CONFIG || {};
  if (!C.url || !C.anonKey || /YOUR_/.test(C.url + C.anonKey)) return;
  var U = String(C.url).replace(/\/+$/, ""), K = C.anonKey, SK = "tripAuth";
  var S = null;
  try { S = JSON.parse(localStorage.getItem(SK) || "null"); } catch (e) {}
  function keep() { try { localStorage.setItem(SK, JSON.stringify(S)); } catch (e) {} }

  async function call(path, opt) {
    var r = await fetch(U + path, opt || {});
    var txt = await r.text(), j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
    if (!r.ok) {
      var err = new Error((j && (j.message || j.msg || j.error_description || j.error)) || ("HTTP " + r.status));
      err.status = r.status; err.body = j; throw err;
    }
    return j;
  }
  function norm(j) {
    return {
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      uid: (j.user && j.user.id) || (S && S.uid)
    };
  }
  var pending = null;
  async function session() {
    var now = Date.now() / 1000;
    if (S && S.access_token && S.expires_at > now + 60) return S;
    if (pending) return pending;
    pending = (async function () {
      if (S && S.refresh_token) {
        try {
          S = norm(await call("/auth/v1/token?grant_type=refresh_token", {
            method: "POST", headers: { apikey: K, "content-type": "application/json" },
            body: JSON.stringify({ refresh_token: S.refresh_token })
          }));
          keep(); return S;
        } catch (e) { if (e.status && e.status !== 400 && e.status !== 401) throw e; }
      }
      // 처음 실행: 익명 계정 만들기(대시보드에서 Anonymous sign-ins 를 켜야 해요)
      S = norm(await call("/auth/v1/signup", {
        method: "POST", headers: { apikey: K, "content-type": "application/json" }, body: JSON.stringify({ data: {} })
      }));
      keep(); return S;
    })();
    try { return await pending; } finally { pending = null; }
  }
  async function headers(extra) {
    var s = await session();
    return Object.assign({ apikey: K, Authorization: "Bearer " + s.access_token, "content-type": "application/json" }, extra || {});
  }
  async function rest(path, opt) {
    opt = opt || {};
    return call("/rest/v1" + path, Object.assign({}, opt, { headers: await headers(opt.headers) }));
  }
  function rpc(fn, args) { return rest("/rpc/" + fn, { method: "POST", body: JSON.stringify(args || {}) }); }
  var q = encodeURIComponent;

  window.TRIP_BACKEND = {
    init: async function () { var s = await session(); return s.uid; },
    listPlans: function () {
      return rest("/plans?select=id,name,city,trip_len,trip_date,code,stops,json,shared,updated_at&order=updated_at.desc");
    },
    savePlan: function (row) {
      return rest("/plans?on_conflict=id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row)
      });
    },
    deletePlan: function (id) { return rest("/plans?id=eq." + q(id), { method: "DELETE" }); },
    setShared: function (id, on) {
      return rest("/plans?id=eq." + q(id), {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify(on ? { shared: true, shared_at: new Date().toISOString() } : { shared: false })
      });
    },
    wallet: function () { return rpc("get_wallet"); },
    checkin: function () { return rpc("checkin"); },
    charge: function (n) { return rpc("charge_test", { amount: n }); },
    community: function () { return rpc("list_community"); },
    unlock: function (id) { return rpc("unlock_plan", { pid: id }); },
    setNickname: function (n) { return rpc("set_nickname", { nick: n }); },
    ai: async function (prompt) {
      var r = await fetch(U + "/functions/v1/ai-replan", { method: "POST", headers: await headers(), body: JSON.stringify({ prompt: prompt }) });
      var j = await r.json().catch(function () { return {}; });
      if (j && typeof j.used === "number") { try { window.dispatchEvent(new CustomEvent("aiusage", { detail: { used: j.used, limit: j.limit } })); } catch (e) {} }
      if (!r.ok) throw { code: j && j.error === "busy" ? "busy" : r.status === 429 ? "rate_limited" : "unavailable", message: j && j.error };
      return j.result;
    },
    // 길찾기용 장소 위치를 카카오에서 실시간으로 찾기 (결과는 저장하지 않아요)
    placeFind: async function (places) {
      var r = await fetch(U + "/functions/v1/place-find", { method: "POST", headers: await headers(), body: JSON.stringify({ places: places }) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || !Array.isArray(j.results)) throw { code: "unavailable" };
      return j.results;
    },
    // 오늘 남은 AI 횟수만 확인 (횟수 차감 없음)
    aiUsage: async function () {
      var r = await fetch(U + "/functions/v1/ai-replan", { method: "POST", headers: await headers(), body: JSON.stringify({ peek: true }) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || typeof j.used !== "number") throw { code: "unavailable" };
      return { used: j.used, limit: j.limit };
    }
  };
})();
