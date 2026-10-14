const { isAuthed } = require("./_auth");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!isAuthed(req)) return res.status(401).json({ error: "No autorizado" });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return res.status(500).json({ error: "Faltan variables de entorno en Vercel" });

  try {
    const r = await fetch(`${url}/rest/v1/resultados?select=*&order=created_at.desc&limit=10000`, {
      headers: { apikey: key },
    });
    if (!r.ok) return res.status(502).json({ error: "Supabase respondió " + r.status });
    return res.status(200).json(await r.json());
  } catch (e) {
    return res.status(502).json({ error: "No se pudo contactar a Supabase" });
  }
};
