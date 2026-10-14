const crypto = require("crypto");

const COOKIE = "ww_dash";
const MAX_AGE = 60 * 60 * 12; // 12 horas

function secret() {
  // La clave secreta de Supabase sirve también para firmar la sesión
  return process.env.SUPABASE_SECRET_KEY || "";
}

function sign(exp) {
  return crypto.createHmac("sha256", secret()).update(String(exp)).digest("hex");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function makeToken() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  return exp + "." + sign(exp);
}

function readCookie(req) {
  const m = (req.headers.cookie || "").match(new RegExp("(?:^|; )" + COOKIE + "=([^;]+)"));
  return m ? m[1] : "";
}

function isAuthed(req) {
  if (!secret()) return false;
  const [exp, sig] = readCookie(req).split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, sign(exp));
}

function setCookie(res, token, maxAge) {
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
}

module.exports = { MAX_AGE, makeToken, isAuthed, setCookie, safeEqual };
