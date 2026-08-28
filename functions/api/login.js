// functions/api/login.js
async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToBase64Url(str) {
  return bytesToBase64Url(new TextEncoder().encode(str));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: "bad_request" }), { status: 400 });
  }

  const password = String(body.password || "");
  const correct = String(env.APP_PASSWORD || "");

  if (!correct || !timingSafeEqual(password, correct)) {
    return new Response(JSON.stringify({ ok: false, reason: "wrong" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionMinutes = Number(env.SESSION_MINUTES || 30);
  const payload = {
    iat: Date.now(),
    exp: Date.now() + sessionMinutes * 60 * 1000,
  };
  const payloadB64 = strToBase64Url(JSON.stringify(payload));
  const key = await importHmacKey(env.JWT_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigB64 = bytesToBase64Url(new Uint8Array(sig));
  const token = payloadB64 + "." + sigB64;

  const cookie = [
    `session=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    // KHÔNG đặt Max-Age / Expires => cookie tự xoá khi đóng hẳn trình duyệt
  ].join("; ");

  return new Response(JSON.stringify({ ok: true, expiresInMinutes: sessionMinutes }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}
