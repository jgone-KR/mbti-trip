// 점검이 끝나서 꺼 둔 함수예요. 아무것도 하지 않아요.
Deno.serve(() => new Response(JSON.stringify({ error: "disabled" }), { status: 410, headers: { "content-type": "application/json" } }));
