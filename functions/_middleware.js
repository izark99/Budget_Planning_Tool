// functions/_middleware.js
const PUBLIC_PATHS = ["/login.html", "/api/login"];
const COOKIE_NAME = "session";

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function verifyToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await importHmacKey(secret);
    const sig = base64UrlToBytes(sigB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payloadB64))
    );
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (PUBLIC_PATHS.includes(url.pathname)) {
    return next();
  }

  const token = getCookie(request, COOKIE_NAME);
  const payload = token ? await verifyToken(token, env.JWT_SECRET) : null;

  if (!payload) {
    // API request -> 401 JSON. File tĩnh -> redirect về login.html
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ ok: false, reason: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return Response.redirect(new URL("/login.html", url.origin), 302);
  }

  const response = await next();
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Cache-Control", "no-store");
  // Sai lệch có chủ đích so với mục 2 của brief: mẫu viết `{ ...response, headers }`,
  // nhưng Response phơi status/statusText qua getter trên prototype nên spread cho ra
  // object rỗng và ép mọi phản hồi tĩnh về 200 — kể cả 404. Xem README, mục "Sai lệch".
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
