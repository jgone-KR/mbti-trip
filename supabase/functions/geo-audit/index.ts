// 임시 점검용 함수였어요. 점검이 끝나서 꺼 뒀어요(2026-10-23).
Deno.serve(() => new Response(JSON.stringify({ error: "gone" }), { status: 410, headers: { "content-type": "application/json" } }));
