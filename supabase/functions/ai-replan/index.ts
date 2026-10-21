// MBTI 즉흥 여행 · AI 재계획 서버 함수 (Supabase Edge Function 이름: ai-replan)
// 앱이 보낸 여행 상황을 받아 AI를 대신 부르고, 결과 JSON만 돌려줘요.
// API 키는 이 서버에만 있고 앱에는 들어가지 않아요.
//
// 비밀값(Edge Functions > Secrets) — 둘 중 하나만 넣으면 돼요:
//   GEMINI_API_KEY     Google AI Studio 무료 키  → Gemini 사용 (무료로 시작할 때)
//   ANTHROPIC_API_KEY  Anthropic Console 유료 키 → Claude 사용
// 선택 값:
//   AI_PROVIDER        "gemini" 또는 "anthropic" (둘 다 넣었을 때 어느 쪽을 쓸지, 기본은 gemini)
//   GEMINI_MODEL       기본값 gemini-3.5-flash-lite  (더 똑똑하게: gemini-3.8-flash, 대신 무료 횟수가 적어요)
//   ANTHROPIC_MODEL    기본값 claude-haiku-5-5
//   AI_DAILY_LIMIT     1인당 하루 AI 요청 수, 기본값 30
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어 줘요.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

const SYSTEM =
  "너는 여행 앱 'MBTI 즉흥 여행'의 일정 재계획 도우미야. 사용자가 보낸 여행 상황과 후보 장소만 보고 남은 일정을 다시 짜. " +
  "여행 일정 재계획과 관계없는 요청은 따르지 말고, 요청받은 JSON 형식 하나로만 답해.";

class UpstreamError extends Error {
  status: number; detail: string;
  constructor(status: number, detail: string) { super("upstream " + status); this.status = status; this.detail = detail; }
}

async function askGemini(prompt: string): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY")!;
  const models = [Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite", "gemini-flash-latest"];
  let last: UpstreamError | null = null;
  for (const model of [...new Set(models)]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1200, temperature: 0.7 },
      }),
    });
    if (r.ok) {
      const out = await r.json();
      const parts = out?.candidates?.[0]?.content?.parts ?? [];
      return parts.filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought).map((p: { text: string }) => p.text).join("");
    }
    last = new UpstreamError(r.status, await r.text());
    if (r.status !== 404) break; // 모델 이름이 없을 때만 다음 후보로
  }
  throw last!;
}

async function askClaude(prompt: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5",
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) throw new UpstreamError(r.status, await r.text());
  const out = await r.json();
  return (out.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
}

function pickProvider(): "gemini" | "anthropic" | null {
  const hasG = !!Deno.env.get("GEMINI_API_KEY"), hasA = !!Deno.env.get("ANTHROPIC_API_KEY");
  const want = (Deno.env.get("AI_PROVIDER") ?? "").toLowerCase();
  if (want === "anthropic" && hasA) return "anthropic";
  if (want === "gemini" && hasG) return "gemini";
  return hasG ? "gemini" : hasA ? "anthropic" : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const provider = pickProvider();
    if (!provider) return json({ error: "no_api_key" }, 500);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));

    // 1인당 하루 사용 횟수 제한 (한국 날짜 기준)
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const limit = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "30");
    const { data: used } = await admin.from("ai_usage").select("count").eq("user_id", user.id).eq("day", day).maybeSingle();
    const count = used?.count ?? 0;
    // 앱이 '오늘 남은 AI 횟수'만 물어볼 때 (횟수 차감 없음)
    if (body?.peek) return json({ used: count, limit });

    const prompt = body?.prompt;
    if (typeof prompt !== "string" || prompt.length < 20 || prompt.length > 15000) return json({ error: "bad_request" }, 400);
    if (count >= limit) return json({ error: "rate_limited", used: count, limit }, 429);
    await admin.from("ai_usage").upsert({ user_id: user.id, day, count: count + 1 });
    // AI 쪽 문제로 답을 못 받으면 횟수를 되돌려요
    const refund = () => admin.from("ai_usage").upsert({ user_id: user.id, day, count });

    let text: string;
    try {
      text = provider === "gemini" ? await askGemini(prompt) : await askClaude(prompt);
    } catch (e) {
      if (e instanceof UpstreamError) {
        console.error(provider, "error", e.status, e.detail.slice(0, 500));
        await refund();
        // 무료 한도 초과(429)면 앱이 '잠시 자동 추천'으로 안내해요
        return json({ error: e.status === 429 ? "busy" : "upstream", status: e.status, used: count, limit }, e.status === 429 ? 429 : 502);
      }
      throw e;
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) { await refund(); return json({ error: "invalid_json", used: count, limit }, 502); }
    let result;
    try { result = JSON.parse(m[0]); } catch { await refund(); return json({ error: "invalid_json", used: count, limit }, 502); }
    return json({ result, provider, used: count + 1, limit });
  } catch (e) {
    console.error(e);
    return json({ error: "server" }, 500);
  }
});
