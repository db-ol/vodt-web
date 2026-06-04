"use strict";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (x) => (x === null || x === undefined) ? "n/a" : (100 * x).toFixed(1) + "%";

function deltaCell(team, base) {
  if (team === null || base === null || team === undefined || base === undefined)
    return `<td class="num delta zero">—</td>`;
  const d = 100 * (team - base);
  const cls = d > 0.05 ? "pos" : d < -0.05 ? "neg" : "zero";
  const sign = d > 0 ? "+" : "";
  return `<td class="num delta ${cls}">${sign}${d.toFixed(1)} pts</td>`;
}

function actionBadge(a) { return `<span class="badge ${esc(a)}">${esc(a)}</span>`; }
function posBadge(p) { return `<span class="pos-badge ${esc(p)}">${esc(p)}</span>`; }

function renderSummary(idx) {
  const t = idx.summary.team || {}, b = idx.summary.baseline || {};
  const meta = `Generated ${esc(idx.generated_at)} · model <code>${esc(idx.config.model)}</code> · `
    + `debate rounds ${idx.config.debate_rounds} · ${idx.cases.length} cases`;
  $("#run-meta").innerHTML = meta;
  const row = (label, key, isPct = true) => `
    <tr><th>${label}</th>
      <td class="num">${isPct ? pct(t[key]) : (t[key] ?? 0).toFixed(2)}</td>
      <td class="num">${isPct ? pct(b[key]) : (b[key] ?? 0).toFixed(2)}</td>
      ${isPct ? deltaCell(t[key], b[key]) : "<td class='num delta zero'></td>"}</tr>`;
  $("#summary-body").innerHTML = `
    <table class="cmp">
      <thead><tr><th>Metric</th><th class="num">VCDT (team)</th><th class="num">Baseline</th><th class="num">Δ</th></tr></thead>
      <tbody>
        ${row("Regulatory Alignment (3-class)", "reg_exact")}
        ${row("Regulatory Alignment (binary)", "reg_binary")}
        ${row("Reasoning Fidelity", "fidelity_recall")}
        ${row("Dose-Optimization raised", "dose_opt_rate")}
        ${row("Mean inter-agent discordance", "mean_discordance", false)}
      </tbody>
    </table>`;
}

function renderCaseList(idx) {
  $("#case-list").innerHTML = idx.cases.map((c) => `
    <button class="case-item" data-id="${esc(c.case_id)}">
      <div class="drug">${esc(c.drug_name)}</div>
      <div class="sub">predicted ${actionBadge(c.predicted_action)} · actual ${actionBadge(c.actual_action)}</div>
    </button>`).join("");
  document.querySelectorAll(".case-item").forEach((el) =>
    el.addEventListener("click", () => selectCase(el.dataset.id)));
}

function agentCard(m) {
  const concerns = (m.key_concerns || []).length
    ? `<div class="concerns">Concerns: ${esc(m.key_concerns.join("; "))}</div>` : "";
  return `<div class="agent">
    <div class="head"><span class="dom">${esc(m.domain.replace(/_/g, " "))}</span>
      <span>${posBadge(m.position)} <span class="sub">conf ${(m.confidence ?? 0).toFixed(2)}</span></span></div>
    <div class="body">${esc(m.summary)}</div>${concerns}
    ${m.key_rationale ? `<div class="concerns">Rationale: ${esc(m.key_rationale)}</div>` : ""}
  </div>`;
}

function defsList(defs, withSeverity) {
  if (!defs || !defs.length) return `<p class="sub">None recorded.</p>`;
  return `<ul class="defs">${defs.map((d) => `<li>${esc(d.description)}
    <span class="src">[${esc(d.source_domain)}${withSeverity && d.severity ? "/" + esc(d.severity) : ""}]</span></li>`).join("")}</ul>`;
}

function renderDetail(c) {
  const correct = c.team.predicted_action === c.ground_truth.actual_action;
  const baseCorrect = c.baseline && c.baseline.predicted_action === c.ground_truth.actual_action;
  const urls = (c.meta.source_urls || []).slice(0, 1)
    .map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">source doc ↗</a>`).join("");
  const cited = c.ground_truth.cited_deficiencies || [];
  const fidelity = c.eval.fidelity_total
    ? `${c.eval.fidelity_matched}/${c.eval.fidelity_total} matched` : "n/a";

  $("#case-detail").innerHTML = `
    <h2>${esc(c.meta.drug_name)}</h2>
    <p class="sub">${esc(c.meta.indication || "")} ${c.meta.nda_bla ? "· " + esc(c.meta.nda_bla) : ""}
       · source: ${esc(c.meta.source || "?")} ${urls}</p>

    <div class="verdict">
      <div class="v"><span class="lbl">Team predicted</span>${actionBadge(c.team.predicted_action)}</div>
      <div class="v"><span class="lbl">Actual FDA action</span>${actionBadge(c.ground_truth.actual_action)}</div>
      <div class="v"><span class="lbl">Match</span><span class="${correct ? "ok" : "bad"}">${correct ? "✓ correct" : "✗ miss"}</span></div>
      ${c.baseline ? `<div class="v"><span class="lbl">Baseline predicted</span>${actionBadge(c.baseline.predicted_action)}
        <span class="${baseCorrect ? "ok" : "bad"}">${baseCorrect ? "✓" : "✗"}</span></div>` : ""}
      <div class="v"><span class="lbl">Discordance</span><b>${(c.team.discordance ?? 0).toFixed(2)}</b></div>
    </div>

    <h3>Stage 1 — Blind review</h3>
    ${(c.team.blind_positions || []).map(agentCard).join("") || "<p class='sub'>n/a</p>"}

    ${(c.team.debate_rounds || []).length ? `<h3>Stage 2 — Debate (${c.team.debate_rounds.length} rounds)</h3>
      ${c.team.debate_rounds.map((r) => `<div class="round"><div class="topic">Round ${r.round}: ${esc(r.topic)}</div>
        <div class="summary">${esc(r.summary)}</div></div>`).join("")}` : ""}

    <h3>Stage 3 — Final consensus</h3>
    ${(c.team.final_positions || []).map(agentCard).join("") || "<p class='sub'>n/a</p>"}

    <h3>Consensus aggregation</h3>
    <div class="aggbox">Pattern: <code>${esc(c.team.aggregation_pattern)}</code>
      <div class="summary">${esc(c.team.aggregation_rationale)}</div></div>

    <h3>Major deficiencies — team (fidelity vs FDA: ${fidelity})</h3>
    ${defsList(c.team.major_deficiencies, true)}
    <h3>FDA-cited deficiencies (ground truth)</h3>
    ${cited.length ? `<ul class="defs">${cited.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : "<p class='sub'>None cited.</p>"}

    ${c.team.dose_recommendation ? `<h3>Dose recommendation</h3><p>${esc(c.team.dose_recommendation)}</p>` : ""}
  `;
}

let CASES_CACHE = {};
async function selectCase(id) {
  document.querySelectorAll(".case-item").forEach((el) =>
    el.classList.toggle("active", el.dataset.id === id));
  if (!CASES_CACHE[id]) CASES_CACHE[id] = await (await fetch(`data/cases/${id}.json`)).json();
  renderDetail(CASES_CACHE[id]);
}

async function main() {
  try {
    const idx = await (await fetch("data/index.json")).json();
    renderSummary(idx);
    renderCaseList(idx);
    if (idx.cases.length) selectCase(idx.cases[0].case_id);
  } catch (e) {
    $("#summary-body").innerHTML = `<p class="bad">Failed to load data: ${esc(e.message)}</p>`;
  }
}
main();
