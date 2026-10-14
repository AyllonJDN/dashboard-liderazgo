const { MAX_AGE, makeToken, setCookie, safeEqual, isAuthed } = require("./_auth");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") return res.status(200).json({ ok: isAuthed(req) });

  if (req.method === "DELETE") {
    setCookie(res, "", 0);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || !process.env.SUPABASE_SECRET_KEY) {
    return res.status(500).json({ error: "Faltan variables de entorno en Vercel" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const given = (body && body.password) || "";

  if (!safeEqual(given, expected)) {
    await new Promise((r) => setTimeout(r, 800)); // frena la fuerza bruta
    return res.status(401).json({ error: "Clave incorrecta" });
  }

  setCookie(res, makeToken(), MAX_AGE);
  return res.status(200).json({ ok: true });
};
