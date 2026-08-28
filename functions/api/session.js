// functions/api/session.js
// Middleware đã chặn request không hợp lệ trước khi tới đây,
// nên nếu code chạy tới đây nghĩa là session đang hợp lệ.
export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
