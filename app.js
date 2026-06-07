"use strict";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (x) => (x === null || x === undefined) ? "n/a" : (100 * x).toFixed(0) + "%";
const ACTIONS = ["Approval", "AcceleratedApproval", "CRL"];
const SHORT = { Approval: "Approval", AcceleratedApproval: "Accel. Appr.", CRL: "CRL" };

const badge = (a) => `<span class="badge ${esc(a)}">${esc(SHORT[a] || a)}</span>`;
const posBadge = (p) => `<span class="pos-badge ${esc(p)}">${esc(p)}</span>`;

/* ---- header chips ---- */
function renderMeta(idx) {
  const c = idx.config || {};
  const chips = [
    ["cases", c.n_cases ?? (idx.cases || []).length],
    ["model", c.model],
    ["debate rounds", c.debate_rounds],
    ["generated", (idx.generated_at || "").replace("T", " ")],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "");
  $("#run-meta").innerHTML = chips.map(([k, v]) =>
    `<span class="chip">${esc(k)} <b>${esc(v)}</b></span>`).join("");
}

/* ---- honesty caveats ---- */
function renderCaveat(idx) {
  const items = [];
  (idx.caveats || []).forEach((c) => items.push(esc(c)));
  const g = idx.genre || {};
  if (g.accuracy != null && g.passes === false)
    items.push(`Document-genre confound: outcomes are <b>${pct(g.accuracy)}</b> separable by document style alone.`);
  if (!items.length) return;
  $("#caveat").hidden = false;
  $("#caveat").innerHTML = `<b>Read with care.</b><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

/* ---- metric comparison ---- */
function metricRow(label, t, b, { lowerBetter = false } = {}) {
  const tv = t == null ? null : t, bv = b == null ? null : b;
  const barW = (x) => x == null ? 0 : Math.max(2, Math.round(100 * x));
  let delta = "";
  if (tv != null && bv != null) {
    const d = 100 * (tv - bv);
    const good = lowerBetter ? d < -0.05 : d > 0.05;
    const bad = lowerBetter ? d > 0.05 : d < -0.05;
    const cls = good ? "pos" : bad ? "neg" : "zero";
    delta = `<span class="delta ${cls}">${d > 0 ? "+" : ""}${d.toFixed(0)} pts</span>`;
  }
  const fmt = lowerBetter ? (x) => (x ?? 0).toFixed(2) : pct;
  return `<tr>
    <td class="metric">${label}</td>
    <td class="num">${fmt(tv)}</td>
    <td><div class="bar team"><span style="width:${barW(tv)}%"></span></div></td>
    <td class="num">${fmt(bv)}</td>
    <td>${delta}</td></tr>`;
}

function renderSummary(idx) {
  const t = idx.summary?.team || {}, b = idx.summary?.baseline || {};
  $("#summary-body").classList.remove("loading");
  $("#summary-body").innerHTML = `<table class="cmp">
    <thead><tr><th>Metric</th><th class="num">Team</th><th></th><th class="num">Baseline</th><th>Δ</th></tr></thead>
    <tbody>
      ${metricRow("Regulatory alignment (3-class)", t.reg_exact, b.reg_exact)}
      ${metricRow("Regulatory alignment (binary)", t.reg_binary, b.reg_binary)}
      ${metricRow("Reasoning fidelity (vs FDA)", t.fidelity_recall, b.fidelity_recall)}
      ${metricRow("Mean inter-agent discordance", t.mean_discordance, b.mean_discordance, { lowerBetter: true })}
    </tbody></table>`;
}

/* ---- confusion matrix ---- */
function renderConfusion(idx) {
  const cm = idx.confusion || {};
  if (!Object.keys(cm).length) { $("#confusion").innerHTML = `<p class="muted small">n/a</p>`; return; }
  let max = 1;
  ACTIONS.forEach((a) => ACTIONS.forEach((p) => { max = Math.max(max, (cm[a]?.[p]) || 0); }));
  const cell = (a, p) => {
    const v = (cm[a]?.[p]) || 0;
    const on = a === p;
    const alpha = v ? (0.18 + 0.55 * v / max) : 0;
    const col = on ? "52,211,153" : "248,113,113";
    const bg = v ? `background:rgba(${col},${alpha.toFixed(2)})` : "";
    return `<td class="cell" style="${bg}">${v || ""}</td>`;
  };
  const head = `<tr><th class="rowlbl"></th>${ACTIONS.map((p) => `<th>${esc(SHORT[p])}</th>`).join("")}</tr>`;
  const rows = ACTIONS.map((a) =>
    `<tr><td class="rowlbl">${esc(SHORT[a])}</td>${ACTIONS.map((p) => cell(a, p)).join("")}</tr>`).join("");
  $("#confusion").innerHTML = `<table class="cm"><caption>rows = actual FDA action · columns = team prediction · green diagonal = correct</caption>${head}${rows}</table>`;
}

/* ---- model axis (exploratory: Sonnet vs Opus on a shared subset) ---- */
function axisMark(pred, actual) {
  const ok = pred === actual;
  return `${badge(pred)}<span class="mk ${ok ? "ok" : "no"}">${ok ? "✓" : "✗"}</span>`;
}

function renderModelAxis(idx) {
  const ax = idx.model_axis;
  if (!ax || !(ax.rows || []).length) return;
  $("#axis").hidden = false;
  $("#axis-hint").textContent = `n=${ax.n} · K=${ax.k} · directional only`;

  const cells = (ax.models || []).map((m) => {
    const up = m.team_correct > m.baseline_correct;
    const down = m.team_correct < m.baseline_correct;
    const arrow = up ? "▲ multi-agent helps" : down ? "▼ multi-agent hurts" : "— no difference";
    return `<div class="axis-cell">
      <div class="m">${esc(m.model)}</div>
      <div class="vr ${up ? "up" : down ? "down" : ""}">${arrow}</div>
      <div class="scores">
        <div class="sc"><span class="k">team</span><span class="v ${m.team_correct >= m.baseline_correct ? "win" : ""}">${m.team_correct}/${m.n}</span></div>
        <div class="sc"><span class="k">single agent</span><span class="v ${m.baseline_correct > m.team_correct ? "win" : ""}">${m.baseline_correct}/${m.n}</span></div>
      </div></div>`;
  }).join("");

  const head = `<tr><th class="drug">case</th><th>actual</th><th>Sonnet team</th><th>Sonnet single</th><th>Opus team</th><th>Opus single</th></tr>`;
  const rows = ax.rows.map((r) => `<tr>
    <td class="drug">${esc(r.drug)}</td>
    <td>${badge(r.actual)}</td>
    <td>${axisMark(r.sonnet_team, r.actual)}</td>
    <td>${axisMark(r.sonnet_base, r.actual)}</td>
    <td>${axisMark(r.opus_team, r.actual)}</td>
    <td>${axisMark(r.opus_base, r.actual)}</td></tr>`).join("");

  $("#axis-body").innerHTML =
    `<p class="axis-note">${esc(ax.caveat || "")}</p>
     <div class="axis2x2">${cells}</div>
     <div class="axis-scroll"><table class="axis">${head}${rows}</table></div>
     ${ax.mechanism ? `<p class="axis-mech">${esc(ax.mechanism)}</p>` : ""}`;
}

/* ---- case list ---- */
function renderCaseList(idx) {
  $("#case-list").innerHTML = (idx.cases || []).map((c) => {
    const ok = c.predicted_action === c.actual_action;
    return `<button class="case-item" data-id="${esc(c.case_id)}">
      <div class="drug">${esc(c.drug_name)}</div>
      <div class="row">${badge(c.predicted_action)}<span class="mini">vs</span>${badge(c.actual_action)}
        <span class="res ${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"}</span></div>
    </button>`;
  }).join("");
  document.querySelectorAll(".case-item").forEach((el) =>
    el.addEventListener("click", () => selectCase(el.dataset.id)));
}

/* ---- agent card ---- */
function agentCard(m) {
  const defs = (m.deficiencies || []);
  const defList = defs.length ? `<ul class="defs">${defs.map((d) =>
    `<li class="${d.blocking ? "blocking" : ""}">${esc(d.description)}${d.blocking ? ' <span class="blk">BLOCKING</span>' : ""}</li>`).join("")}</ul>`
    : (m.key_concerns?.length ? `<ul class="defs">${m.key_concerns.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : "");
  return `<div class="agent">
    <div class="head"><span class="dom">${esc((m.domain || "").replace(/_/g, " "))}</span>
      <span class="right">${posBadge(m.position)}<span class="mini faint">conf ${(m.confidence ?? 0).toFixed(2)}</span></span></div>
    <div class="body">${esc(m.summary)}</div>${defList}
  </div>`;
}

function renderDetail(c) {
  const correct = c.team.predicted_action === c.ground_truth.actual_action;
  const baseCorrect = c.baseline && c.baseline.predicted_action === c.ground_truth.actual_action;
  const url = (c.meta.source_urls || [])[0];
  const cited = c.ground_truth.cited_deficiencies || [];
  const fid = c.eval && c.eval.fidelity_total ? `${c.eval.fidelity_matched}/${c.eval.fidelity_total} matched` : "n/a";

  $("#case-detail").innerHTML = `
    <h2>${esc(c.meta.drug_name)}</h2>
    <p class="sub">${esc(c.meta.indication || "—")}${c.meta.nda_bla ? " · " + esc(c.meta.nda_bla) : ""}
      · source: ${esc(c.meta.source || "?")}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">document ↗</a>` : ""}</p>

    <div class="verdict">
      <div class="vbox"><span class="lbl">Team predicted</span><span class="big">${badge(c.team.predicted_action)}</span></div>
      <div class="vbox"><span class="lbl">Actual FDA action</span><span class="big">${badge(c.ground_truth.actual_action)}</span></div>
      <div class="vbox"><span class="lbl">Match</span><span class="big ${correct ? "match-ok" : "match-bad"}">${correct ? "✓ correct" : "✗ miss"}</span></div>
      ${c.baseline ? `<div class="vbox"><span class="lbl">Baseline</span><span class="big">${badge(c.baseline.predicted_action)} <span class="${baseCorrect ? "match-ok" : "match-bad"}">${baseCorrect ? "✓" : "✗"}</span></span></div>` : ""}
      <div class="vbox"><span class="lbl">Discordance</span><span class="big">${(c.team.discordance ?? 0).toFixed(2)}</span></div>
    </div>

    <h3>Stage 1 · Blind review</h3>
    ${(c.team.blind_positions || []).map(agentCard).join("") || "<p class='muted small'>n/a</p>"}

    ${(c.team.debate_rounds || []).length ? `<h3>Stage 2 · Debate (${c.team.debate_rounds.length} rounds)</h3>
      ${c.team.debate_rounds.map((r) => `<div class="round"><div class="topic">Round ${r.round}: ${esc(r.topic)}</div>
        <div class="summary">${esc(r.summary)}</div></div>`).join("")}` : ""}

    <h3>Stage 3 · Final consensus</h3>
    ${(c.team.final_positions || []).map(agentCard).join("") || "<p class='muted small'>n/a</p>"}

    <h3>Consensus rule</h3>
    <div class="aggbox"><span class="pat">${esc(c.team.aggregation_pattern)}</span>
      <div class="summary">${esc(c.team.aggregation_rationale)}</div></div>

    <h3>Major deficiencies — team (fidelity vs FDA: ${fid})</h3>
    ${defsBlock(c.team.major_deficiencies, true)}
    <h3>FDA-cited deficiencies (ground truth)</h3>
    ${cited.length ? `<ul class="deflist">${cited.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : "<p class='muted small'>None cited.</p>"}

    ${c.team.dose_recommendation ? `<h3>Dose recommendation</h3><p class="small">${esc(c.team.dose_recommendation)}</p>` : ""}`;
}

function defsBlock(defs, withSrc) {
  if (!defs || !defs.length) return `<p class="muted small">None recorded.</p>`;
  return `<ul class="deflist">${defs.map((d) =>
    `<li>${esc(d.description)} <span class="src">[${esc(d.source_domain)}${withSrc && d.severity ? "/" + esc(d.severity) : ""}]</span></li>`).join("")}</ul>`;
}

const CACHE = {};
async function selectCase(id) {
  document.querySelectorAll(".case-item").forEach((el) => el.classList.toggle("active", el.dataset.id === id));
  if (!CACHE[id]) CACHE[id] = await (await fetch(`data/cases/${id}.json`)).json();
  renderDetail(CACHE[id]);
}

async function main() {
  try {
    const idx = await (await fetch("data/index.json")).json();
    renderMeta(idx); renderCaveat(idx); renderSummary(idx); renderConfusion(idx); renderModelAxis(idx); renderCaseList(idx);
    if ((idx.cases || []).length) selectCase(idx.cases[0].case_id);
  } catch (e) {
    $("#summary-body").innerHTML = `<p class="bad">Failed to load data: ${esc(e.message)}</p>`;
  }
}
main();
