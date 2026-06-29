// Serverless endpoint for the blinded dose-derivation expert review.
// IMPORTANT: this repo is PUBLIC. No benchmark data and no source mapping are committed here.
// The blind cases and the source mapping live ONLY in your private Vercel KV (seeded once via
// ?action=seed) or, as a fallback, in the REVIEW_DATA env var. The mapping is returned only to the
// admin results call; clients (reviewers) never receive it.
//
//   POST ?action=seed&key=ADMIN_KEY   body {cases:[...], mapping:{...}}  -> store data in KV (one time)
//   GET  ?action=cases&password=...                                      -> blind cases (no source)
//   POST  body {action:'submit', password, reviewer, submission}         -> store submission in KV
//   GET  ?action=results&key=ADMIN_KEY                                   -> submissions + mapping

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const REVIEW_PASSWORD = process.env.REVIEW_PASSWORD || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const DATA_KEY = "review_data";
const LIST_KEY = "dose_eval_submissions";

let _cache = null;

async function kv(cmd) {
  if (!KV_URL || !KV_TOKEN) throw new Error("KV not configured (set KV_REST_API_URL and KV_REST_API_TOKEN)");
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + KV_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error("KV error " + r.status);
  return (await r.json()).result;
}

async function getData() {
  if (_cache) return _cache;
  let raw = null;
  try { raw = await kv(["GET", DATA_KEY]); } catch (e) { /* fall through to env */ }
  if (!raw && process.env.REVIEW_DATA) raw = process.env.REVIEW_DATA;
  if (!raw) throw new Error("review data not seeded (run ?action=seed or set REVIEW_DATA)");
  _cache = typeof raw === "string" ? JSON.parse(raw) : raw;
  return _cache;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  const done = (code, obj) => res.status(code).end(JSON.stringify(obj));
  try {
    const q = req.query || {};
    if (req.method === "GET" && q.action === "cases") {
      if (!REVIEW_PASSWORD || q.password !== REVIEW_PASSWORD) return done(401, { error: "incorrect password" });
      const data = await getData();
      return done(200, { cases: data.cases }); // blind only, no mapping
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (body.action === "seed") {
        if (!ADMIN_KEY || (q.key || body.key) !== ADMIN_KEY) return done(401, { error: "incorrect admin key" });
        if (!body.cases || !body.mapping) return done(400, { error: "need {cases, mapping}" });
        await kv(["SET", DATA_KEY, JSON.stringify({ cases: body.cases, mapping: body.mapping })]);
        _cache = null;
        return done(200, { ok: true, cases: body.cases.length });
      }
      if (body.action === "submit") {
        if (!REVIEW_PASSWORD || body.password !== REVIEW_PASSWORD) return done(401, { error: "incorrect password" });
        if (!body.submission) return done(400, { error: "empty submission" });
        const rec = {
          reviewer: (body.reviewer || "anonymous").slice(0, 120),
          submission: body.submission,
          ts: new Date().toISOString(),
          ua: (req.headers["user-agent"] || "").slice(0, 200),
        };
        await kv(["LPUSH", LIST_KEY, JSON.stringify(rec)]);
        return done(200, { ok: true });
      }
      return done(400, { error: "unknown action" });
    }
    if (req.method === "GET" && q.action === "results") {
      if (!ADMIN_KEY || q.key !== ADMIN_KEY) return done(401, { error: "incorrect admin key" });
      const data = await getData();
      const raw = (await kv(["LRANGE", LIST_KEY, "0", "-1"])) || [];
      const submissions = raw.map((s) => { try { return JSON.parse(s); } catch (e) { return { raw: s }; } });
      return done(200, { submissions, mapping: data.mapping });
    }
    return done(400, { error: "unknown action" });
  } catch (e) {
    return done(500, { error: String((e && e.message) || e) });
  }
};
