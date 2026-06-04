# VODT — results demo

A static results viewer for **VODT** (Virtual Oncology Development Team): a
role-based multi-agent system that simulates an FDA oncology review team and
predicts regulatory actions, compared against a single-agent baseline and the
real FDA outcome.

This repo is **only the demo** — it contains no model code and no secrets. It
reads a precomputed JSON snapshot in `data/` and renders:

- the VCDT-vs-baseline metric comparison (Regulatory Alignment, Reasoning
  Fidelity, Dose-Optimization, Inter-Agent Discordance), and
- per-case deliberation walkthroughs (blind review → debate → consensus →
  aggregation), with team verdict vs. actual FDA action.

It's a plain static site (no build step): `index.html` + `app.js` + `styles.css`
+ `data/`.

## Deploy on Vercel

1. Push this repo to GitHub.
2. In Vercel → **Add New Project** → import the repo.
3. Framework Preset: **Other** · Build Command: *(none)* · Output Directory: `.`
   (it's static — Vercel serves the files as-is).
4. Deploy. (Optionally enable password protection if you want it non-public.)

Local preview: `python3 -m http.server` then open <http://localhost:8000>.

## Refreshing the data

The `data/` snapshot is produced by the (private) VODT harness:

```bash
# in the vodt repo
vodt export-web --cases data/cases --debate-rounds 3 --out /path/to/vodt-web/data
```

Then commit the updated `data/` here. The snapshot deliberately excludes the full
redacted FDA review text and any API keys, so it's safe to publish.
