// MBTI 즉흥 여행 · 장소 위치 찾기 (Supabase Edge Function 이름: place-find)
// 길찾기 버튼을 누를 때 카카오 로컬 API로 장소 좌표를 실시간으로 찾아 돌려줘요.
// 카카오 정책상 검색 결과는 저장하지 않아요(서버·앱 모두 저장 안 함).
// 비밀값: KAKAO_REST_KEY (Kakao Developers > 앱 > 플랫폼 키 > REST API 키)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });

type Doc = { place_name: string; x: string; y: string; road_address_name?: string; address_name?: string; distance?: string };

async function search(key: string, q: string, x?: number, y?: number): Promise<Doc[]> {
  const u = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  u.searchParams.set("query", q);
  u.searchParams.set("size", "5");
  if (typeof x === "number" && typeof y === "number") {
    u.searchParams.set("x", String(x)); u.searchParams.set("y", String(y));
    u.searchParams.set("radius", "20000"); u.searchParams.set("sort", "accuracy");
  }
  const r = await fetch(u, { headers: { Authorization: "KakaoAK " + key } });
  if (!r.ok) throw new Error("kakao " + r.status + " " + (await r.text()).slice(0, 200));
  return (await r.json()).documents ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const key = Deno.env.get("KAKAO_REST_KEY");
  if (!key) return json({ error: "no_api_key" }, 500);
  try {
    const body = await req.json().catch(() => ({}));
    const list = Array.isArray(body?.places) ? body.places.slice(0, 2) : [];
    if (!list.length) return json({ error: "bad_request" }, 400);
    const out = [];
    for (const p of list) {
      const q = String(p?.q ?? "").slice(0, 60).trim();
      if (!q) { out.push(null); continue; }
      const x = typeof p.lng === "number" ? p.lng : undefined, y = typeof p.lat === "number" ? p.lat : undefined;
      let docs = await search(key, q, x, y);
      if (!docs.length && p.alt) docs = await search(key, String(p.alt).slice(0, 60), x, y);
      const d = docs[0];
      out.push(d ? { name: d.place_name, lat: Number(d.y), lng: Number(d.x), addr: d.road_address_name || d.address_name || "" } : null);
    }
    return json({ results: out });
  } catch (e) {
    console.error(e);
    return json({ error: "upstream" }, 502);
  }
});
