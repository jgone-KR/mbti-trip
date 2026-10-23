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

type Doc = { id?: string; place_name: string; x: string; y: string; road_address_name?: string; address_name?: string; distance?: string };

async function search(key: string, q: string, x?: number, y?: number, radius = 20000, cat = ""): Promise<Doc[]> {
  const u = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  u.searchParams.set("query", q);
  u.searchParams.set("size", cat ? "5" : "15");
  if (typeof x === "number" && typeof y === "number") {
    u.searchParams.set("x", String(x)); u.searchParams.set("y", String(y));
    u.searchParams.set("radius", String(radius)); u.searchParams.set("sort", cat ? "distance" : "accuracy");
  }
  if (cat) u.searchParams.set("category_group_code", cat);
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
    const list = Array.isArray(body?.places) ? body.places.slice(0, 12) : [];
    if (!list.length) return json({ error: "bad_request" }, 400);
    // 코스 지도 핀: 한 번에 최대 12곳을 동시에 찾아요 (길찾기는 1곳씩)
    const out = await Promise.all(list.map(async (p: any) => { try {
      const q = String(p?.q ?? "").slice(0, 60).trim();
      if (!q) return null;
      const x = typeof p.lng === "number" ? p.lng : undefined, y = typeof p.lat === "number" ? p.lat : undefined;
      // 앱이 확인해 둔 카카오 장소 ID가 있으면 그 ID와 같은 장소만 써요 (다른 지점·다른 가게로 안내하지 않게)
      const want = typeof p.id === "string" && /^\d{3,12}$/.test(p.id) ? p.id : "";
      let docs = await search(key, q, x, y);
      let d = want ? docs.find((v) => v.id === want) : docs[0];
      if (!d && p.alt) { const d2 = await search(key, String(p.alt).slice(0, 60), x, y); d = want ? d2.find((v) => v.id === want) : d2[0]; }
      if (!d) return want ? { id: want, miss: 1 } : null;
      const hit: Record<string, unknown> = { id: d.id, name: d.place_name, lat: Number(d.y), lng: Number(d.x), addr: d.road_address_name || d.address_name || "" };
      // 전망대·산·공원처럼 차가 끝까지 못 가는 곳: 1.5km 안의 주차장을 같이 알려 줘요
      if (p.park) {
        const pk = (await search(key, d.place_name + " 주차장", Number(d.x), Number(d.y), 1500, "PK6"))[0]
          ?? (await search(key, "주차장", Number(d.x), Number(d.y), 1500, "PK6"))[0];
        if (pk) {
          const r = Math.PI / 180, la1 = Number(d.y) * r, la2 = Number(pk.y) * r, dl = la2 - la1, dn = (Number(pk.x) - Number(d.x)) * r;
          const m = Math.round(2 * 6371000 * Math.asin(Math.sqrt(Math.sin(dl / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dn / 2) ** 2)));
          hit.park = { name: pk.place_name, lat: Number(pk.y), lng: Number(pk.x), m };
        }
      }
      return hit;
    } catch (e) { console.error(e); return null; } }));
    return json({ results: out });
  } catch (e) {
    console.error(e);
    return json({ error: "upstream" }, 502);
  }
});
