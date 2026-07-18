import { DEFAULT_POLICY, analyzeTelemetry, buildIncidentExport, generateReadings } from "./telemetry-engine.mjs";

const workspace = document.querySelector("#workspace");
const state = {
  suite: "",
  notice: "",
  scenarios: [],
  readings: new Map(),
  analyses: new Map(),
  selectedId: "dock-excursion",
  policy: { ...DEFAULT_POLICY },
  decision: null,
  operatorNote: "",
  audit: []
};

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const selectedScenario = () => state.scenarios.find((scenario) => scenario.id === state.selectedId) || state.scenarios[0];
const selectedReadings = () => state.readings.get(state.selectedId) || [];
const selectedAnalysis = () => state.analyses.get(state.selectedId);
const time = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function addAudit(action, detail) {
  state.audit.unshift({ at: new Date().toISOString(), action, detail });
  renderAudit();
}

function shell() {
  workspace.innerHTML = `<div class="console-shell">
    <aside class="load-rail" aria-labelledby="load-heading">
      <div class="rail-heading"><p class="eyebrow">Synthetic monitored fleet</p><h1 id="load-heading">Active loads</h1><p>${esc(state.suite)}</p></div>
      <div id="load-list" class="load-list"></div>
      <div class="rule-note"><strong>Alert contract</strong><p>Persistence confirms a run. Hysteresis waits for clear evidence before closing it.</p><span id="rule-summary"></span></div>
      <p class="privacy-note">${esc(state.notice)}</p>
    </aside>
    <section class="operations" aria-labelledby="operation-heading">
      <div class="operation-heading"><div><p class="eyebrow">Live drill workspace</p><h2 id="operation-heading"></h2><p id="load-profile"></p></div><div class="heading-actions"><span id="load-status" class="status"></span><button id="export-incident" class="secondary" type="button">Export incident</button></div></div>
      <div id="journey-strip" class="journey-strip" aria-label="Synthetic journey stages"></div>
      <section id="metric-strip" class="metric-strip" aria-label="Latest telemetry metrics"></section>
      <section class="chart-section" aria-labelledby="chart-heading"><div class="panel-heading"><div><p class="eyebrow">Time-series evidence</p><h3 id="chart-heading">Temperature and humidity</h3></div><span id="chart-meta"></span></div><canvas id="telemetry-chart" width="1120" height="390" tabindex="0" aria-label="Telemetry timeline showing temperature, humidity, policy band, and missing intervals"></canvas><div class="chart-legend"><span><i class="temperature"></i>Temperature</span><span><i class="humidity"></i>Humidity</span><span><i class="policy"></i>2-8 C policy band</span><span><i class="missing"></i>Missing interval</span></div></section>
      <div class="analysis-grid">
        <section class="alerts-section" aria-labelledby="alerts-heading"><div class="panel-heading"><div><p class="eyebrow">Policy evaluation</p><h3 id="alerts-heading">Alert evidence</h3></div><span id="alert-count"></span></div><div id="alerts-list" class="alerts-list"></div><div id="suppressions" class="suppressions"></div></section>
        <section class="policy-section" aria-labelledby="policy-heading"><div class="panel-heading"><div><p class="eyebrow">Detection contract</p><h3 id="policy-heading">Rule controls</h3></div><button id="reset-policy" class="text-button" type="button">Reset</button></div><div id="policy-controls" class="policy-controls"></div></section>
      </div>
      <section class="telemetry-section" aria-labelledby="telemetry-heading"><div class="panel-heading"><div><p class="eyebrow">Raw synthetic evidence</p><h3 id="telemetry-heading">Reading ledger</h3></div><span>Newest first</span></div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Stage</th><th>Temp</th><th>Humidity</th><th>Battery</th><th>Signal</th><th>Door</th></tr></thead><tbody id="telemetry-body"></tbody></table></div></section>
      <section class="decision-section" aria-labelledby="decision-heading"><div><p class="eyebrow">Human incident gate</p><h3 id="decision-heading">Operator disposition</h3><p>Automated findings remain visible. A person owns acknowledgement, escalation, and product disposition.</p><p id="decision-summary" class="decision-summary">No disposition recorded.</p></div><div class="decision-form"><label for="operator-note">Evidence note<input id="operator-note" type="text" maxlength="180" placeholder="Reason for the human disposition"></label><div><button id="acknowledge-alerts" type="button">Acknowledge</button><button id="escalate-load" class="escalate" type="button">Escalate load</button></div><p id="decision-error" role="alert"></p></div></section>
      <section class="audit-section" aria-labelledby="audit-heading"><div class="panel-heading"><div><p class="eyebrow">Session evidence</p><h3 id="audit-heading">Decision audit</h3></div><span>Local browser only</span></div><ol id="audit-list"></ol></section>
    </section>
  </div>`;
}

function renderLoads() {
  document.querySelector("#load-list").innerHTML = state.scenarios.map((scenario) => {
    const analysis = state.analyses.get(scenario.id);
    return `<button class="load-button" type="button" data-load="${esc(scenario.id)}" aria-pressed="${scenario.id === state.selectedId}"><span>${esc(scenario.loadId)}</span><strong>${esc(scenario.title)}</strong><small>${analysis.status} / ${analysis.alerts.length} alert${analysis.alerts.length === 1 ? "" : "s"}</small><i class="load-health ${analysis.status}"></i></button>`;
  }).join("");
}

function renderHeading() {
  const scenario = selectedScenario();
  const analysis = selectedAnalysis();
  document.querySelector("#operation-heading").textContent = `${scenario.loadId} / ${scenario.title}`;
  document.querySelector("#load-profile").textContent = `${scenario.cargo}. ${scenario.profile}`;
  const status = document.querySelector("#load-status");
  status.className = `status ${analysis.status}`;
  status.textContent = analysis.status;
  document.querySelector("#rule-summary").textContent = analysis.explanation;
  document.querySelector("#chart-meta").textContent = `${selectedReadings().length} received / 5-minute target cadence`;
}

function renderJourney() {
  const readings = selectedReadings();
  const stages = ["Packing bay", "Transfer lane", "Cross-dock", "Receiving"];
  document.querySelector("#journey-strip").innerHTML = stages.map((stage, index) => {
    const stageReadings = readings.filter((reading) => reading.stage === stage);
    const current = index === stages.length - 1;
    const max = stageReadings.length ? Math.max(...stageReadings.map((reading) => reading.temperature)) : null;
    return `<div class="journey-stage ${current ? "current" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${stage}</strong><small>${stageReadings.length} readings${max === null ? "" : ` / max ${max.toFixed(1)} C`}</small></div></div>`;
  }).join("");
}

function renderMetrics() {
  const metrics = selectedAnalysis().metrics;
  const items = [
    ["Current temp", `${metrics.currentTemperature.toFixed(1)} C`, `range ${metrics.minTemperature.toFixed(1)}-${metrics.maxTemperature.toFixed(1)} C`],
    ["Humidity", `${metrics.currentHumidity.toFixed(0)}%`, "relative humidity"],
    ["Battery", `${metrics.currentBattery}%`, "latest sensor level"],
    ["Signal", `${metrics.currentSignal}%`, "latest link strength"],
    ["Completeness", `${metrics.completeness}%`, `${metrics.readings} readings received`],
    ["Door open", `${metrics.openDoorPoints * 5} min`, "observed open state"]
  ];
  document.querySelector("#metric-strip").innerHTML = items.map(([label, value, note]) => `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
}

function drawChart() {
  const canvas = document.querySelector("#telemetry-chart");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const readings = selectedReadings();
  const policy = state.policy;
  const width = canvas.width;
  const height = canvas.height;
  const pad = { left: 58, right: 58, top: 36, bottom: 46 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const maxElapsed = selectedScenario().points * 5 - 5;
  const x = (reading) => pad.left + reading.elapsedMinutes / maxElapsed * plotWidth;
  const tempY = (value) => pad.top + (16 - value) / 18 * plotHeight;
  const humidityY = (value) => pad.top + (100 - value) / 100 * plotHeight;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#10181a";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(63, 180, 139, 0.12)";
  context.fillRect(pad.left, tempY(policy.tempMax), plotWidth, tempY(policy.tempMin) - tempY(policy.tempMax));
  context.font = "12px ui-monospace, monospace";
  context.textAlign = "right";
  for (let value = 0; value <= 15; value += 3) {
    const y = tempY(value);
    context.strokeStyle = "#304144";
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke();
    context.fillStyle = "#9db0b3";
    context.fillText(`${value} C`, pad.left - 10, y + 4);
  }
  context.textAlign = "center";
  for (let minute = 0; minute <= maxElapsed; minute += 60) {
    const px = pad.left + minute / maxElapsed * plotWidth;
    context.fillStyle = "#9db0b3";
    context.fillText(`+${minute}m`, px, height - 18);
  }

  const drawSeries = (valueFor, yFor, stroke, gapAware) => {
    context.strokeStyle = stroke;
    context.lineWidth = 3;
    context.beginPath();
    readings.forEach((reading, index) => {
      const previous = readings[index - 1];
      const move = index === 0 || (gapAware && previous && reading.elapsedMinutes - previous.elapsedMinutes > 5);
      if (move) context.moveTo(x(reading), yFor(valueFor(reading))); else context.lineTo(x(reading), yFor(valueFor(reading)));
    });
    context.stroke();
  };
  drawSeries((reading) => reading.humidity, humidityY, "#59a9cc", true);
  drawSeries((reading) => reading.temperature, tempY, "#f2c14e", true);

  readings.forEach((reading, index) => {
    const previous = readings[index - 1];
    if (previous && reading.elapsedMinutes - previous.elapsedMinutes > 5) {
      const center = (x(previous) + x(reading)) / 2;
      context.save(); context.setLineDash([7, 6]); context.strokeStyle = "#e45d55"; context.lineWidth = 2;
      context.beginPath(); context.moveTo(center, pad.top); context.lineTo(center, height - pad.bottom); context.stroke(); context.restore();
    }
    if (reading.temperature < policy.tempMin || reading.temperature > policy.tempMax) {
      context.fillStyle = "#e45d55";
      context.beginPath(); context.arc(x(reading), tempY(reading.temperature), 5, 0, Math.PI * 2); context.fill();
    }
    if (reading.door) {
      context.fillStyle = "rgba(230, 122, 60, 0.22)";
      context.fillRect(x(reading) - 3, pad.top, 6, plotHeight);
    }
  });
}

function renderAlerts() {
  const analysis = selectedAnalysis();
  document.querySelector("#alert-count").textContent = `${analysis.alerts.length} active / ${analysis.suppressions.length} suppressed`;
  document.querySelector("#alerts-list").innerHTML = analysis.alerts.length ? analysis.alerts.map((item) => `<article class="alert ${item.severity}"><span>${esc(item.severity)}</span><div><h4>${esc(item.title)}</h4><p>${esc(item.evidence)}</p></div></article>`).join("") : '<div class="clear-state"><strong>No alert contract is active.</strong><p>The reading ledger remains available for human review.</p></div>';
  document.querySelector("#suppressions").innerHTML = analysis.suppressions.length ? `<div class="suppression-heading"><strong>Suppressed by persistence</strong><span>Visible, not escalated</span></div>${analysis.suppressions.map((item) => `<article><h4>${esc(item.title)}</h4><p>${esc(item.evidence)}</p></article>`).join("")}` : "";
}

function renderPolicy() {
  const controls = [
    ["tempMax", "Maximum temperature", 5, 12, 0.5, " C"],
    ["humidityMax", "Maximum humidity", 60, 90, 1, "%"],
    ["persistence", "Breach persistence", 1, 6, 1, " readings"],
    ["clearPersistence", "Clear hysteresis", 1, 4, 1, " readings"],
    ["maxGapMinutes", "Maximum sensor gap", 5, 30, 5, " min"],
    ["batteryMin", "Battery floor", 10, 40, 1, "%"]
  ];
  document.querySelector("#policy-controls").innerHTML = controls.map(([key, label, min, max, step, unit]) => `<label for="${key}"><span>${label}<output>${state.policy[key]}${unit}</output></span><input id="${key}" data-policy="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state.policy[key]}"></label>`).join("");
}

function renderLedger() {
  const analysis = selectedAnalysis();
  const alertIndexes = new Set(analysis.alerts.flatMap((item) => item.run ? [item.run.start.index, item.run.end.index] : []));
  document.querySelector("#telemetry-body").innerHTML = [...selectedReadings()].reverse().map((reading) => {
    const breach = reading.temperature < state.policy.tempMin || reading.temperature > state.policy.tempMax;
    return `<tr class="${breach || alertIndexes.has(reading.index) ? "breach" : ""}"><td><time datetime="${reading.at}">${time(reading.at)}</time></td><td>${esc(reading.stage)}</td><td>${reading.temperature.toFixed(1)} C</td><td>${reading.humidity.toFixed(0)}%</td><td>${reading.battery}%</td><td>${reading.signal}%</td><td><span class="door-state ${reading.door ? "open" : ""}">${reading.door ? "Open" : "Closed"}</span></td></tr>`;
  }).join("");
}

function renderDecision() {
  const summary = document.querySelector("#decision-summary");
  document.querySelector("#operator-note").value = state.operatorNote;
  document.querySelector("#decision-error").textContent = "";
  if (!state.decision) { summary.className = "decision-summary"; summary.textContent = "No disposition recorded."; return; }
  summary.className = `decision-summary ${state.decision.action}`;
  summary.textContent = `${state.decision.action === "acknowledged" ? "Alert evidence acknowledged" : "Load escalated"} by human operator. Evidence: ${state.decision.note}`;
}

function renderAudit() {
  const list = document.querySelector("#audit-list");
  if (!list) return;
  list.innerHTML = state.audit.map((item) => `<li><time>${time(item.at)}</time><strong>${esc(item.action)}</strong><span>${esc(item.detail)}</span></li>`).join("");
}

function renderAll() {
  renderLoads(); renderHeading(); renderJourney(); renderMetrics(); renderAlerts(); renderPolicy(); renderLedger(); renderDecision(); renderAudit(); drawChart();
}

function analyzeAll() {
  for (const scenario of state.scenarios) state.analyses.set(scenario.id, analyzeTelemetry(state.readings.get(scenario.id), state.policy));
}

function reanalyze() {
  analyzeAll();
  state.decision = null;
  renderAll();
  addAudit("Policy recalculated", `${selectedScenario().loadId}: ${selectedAnalysis().alerts.length} active and ${selectedAnalysis().suppressions.length} suppressed.`);
}

function downloadIncident() {
  const report = buildIncidentExport(selectedScenario(), selectedAnalysis(), state.decision);
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "coldchain-incident.json"; document.body.append(anchor);
  window.setTimeout(() => { anchor.click(); window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 10000); }, 0);
}

function recordDecision(action) {
  const note = state.operatorNote.trim();
  if (note.length < 12) { document.querySelector("#decision-error").textContent = "A 12-character evidence note is required for a human disposition."; return; }
  const analysis = selectedAnalysis();
  state.decision = { action, note, at: new Date().toISOString(), loadId: selectedScenario().loadId, alertIds: analysis.alerts.map((item) => item.id) };
  addAudit(action === "acknowledged" ? "Alerts acknowledged" : "Load escalated", `${selectedScenario().loadId}: ${analysis.alerts.length} active alert(s) preserved.`);
  renderDecision();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const load = event.target.closest("[data-load]");
    if (load) {
      state.selectedId = load.dataset.load;
      state.decision = null; state.operatorNote = "";
      renderAll();
      addAudit("Load selected", `${selectedScenario().loadId}: ${selectedScenario().title}.`);
      return;
    }
    if (event.target.id === "reset-policy") { state.policy = { ...DEFAULT_POLICY }; reanalyze(); return; }
    if (event.target.id === "export-incident") { downloadIncident(); addAudit("Incident exported", `${selectedScenario().loadId} evidence exported locally.`); return; }
    if (event.target.id === "acknowledge-alerts") { recordDecision("acknowledged"); return; }
    if (event.target.id === "escalate-load") { recordDecision("escalated"); return; }
    if (event.target.id === "retry-load") initialize();
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "operator-note") state.operatorNote = event.target.value;
  });
  document.addEventListener("change", (event) => {
    if (!event.target.matches("[data-policy]")) return;
    state.policy[event.target.dataset.policy] = Number(event.target.value);
    reanalyze();
  });
}

async function initialize() {
  try {
    const response = await fetch("data/scenarios.json");
    if (!response.ok) throw new Error(`Scenario request failed with ${response.status}`);
    const manifest = await response.json();
    if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length !== 4) throw new Error("Expected four synthetic shipment scenarios.");
    state.suite = manifest.suite;
    state.notice = manifest.notice;
    state.scenarios = manifest.scenarios;
    state.readings.clear(); state.analyses.clear(); state.audit = []; state.decision = null;
    for (const scenario of state.scenarios) state.readings.set(scenario.id, generateReadings(scenario));
    analyzeAll();
    shell(); bindEvents(); renderAll();
    addAudit("Synthetic suite loaded", `${state.scenarios.length} deterministic drills; no external telemetry connection.`);
  } catch (error) {
    workspace.innerHTML = `<section class="error-state"><p class="eyebrow">Fixture load failed</p><h1>The synthetic telemetry drills could not be prepared.</h1><p>${esc(error.message)}</p><button id="retry-load" type="button">Retry</button></section>`;
  }
}

initialize();
