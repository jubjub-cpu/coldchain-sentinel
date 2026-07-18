export const DEFAULT_POLICY = Object.freeze({
  tempMin: 2,
  tempMax: 8,
  humidityMax: 75,
  batteryMin: 20,
  signalMin: 30,
  persistence: 3,
  clearPersistence: 2,
  doorMinutes: 20,
  maxGapMinutes: 15
});

const round = (value, digits = 1) => Number(value.toFixed(digits));
const minutesBetween = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
const stageFor = (index, points) => {
  const ratio = index / Math.max(1, points - 1);
  if (ratio < 0.2) return "Packing bay";
  if (ratio < 0.56) return "Transfer lane";
  if (ratio < 0.82) return "Cross-dock";
  return "Receiving";
};

function eventAt(events, kind, index) {
  return events.find((event) => event.kind === kind && index >= event.start && index <= event.end);
}

export function generateReadings(scenario) {
  const readings = [];
  const intervalMinutes = 5;
  for (let index = 0; index < scenario.points; index += 1) {
    if (eventAt(scenario.events, "missing", index)) continue;
    const time = new Date(new Date(scenario.start).getTime() + index * intervalMinutes * 60000).toISOString();
    let temperature = scenario.tempBase + Math.sin(index * 0.53) * 0.32 + Math.cos(index * 0.19) * 0.12;
    const fixedTemp = eventAt(scenario.events, "temperature", index);
    if (fixedTemp) temperature = fixedTemp.value;
    const ramp = eventAt(scenario.events, "temperature-ramp", index);
    if (ramp) {
      const center = (ramp.start + ramp.end) / 2;
      const half = Math.max(1, (ramp.end - ramp.start) / 2);
      const weight = Math.max(0.25, 1 - Math.abs(index - center) / (half + 1));
      temperature = scenario.tempBase + (ramp.peak - scenario.tempBase) * weight;
    }
    let humidity = scenario.humidityBase + Math.sin(index * 0.31) * 2.2;
    const humidityEvent = eventAt(scenario.events, "humidity", index);
    if (humidityEvent) humidity = humidityEvent.value + Math.sin(index) * 1.2;
    const door = Boolean(eventAt(scenario.events, "door", index));
    const batteryEnd = scenario.batteryEnd ?? Math.max(50, scenario.batteryStart - 5);
    const battery = scenario.batteryStart + (batteryEnd - scenario.batteryStart) * index / Math.max(1, scenario.points - 1);
    let signal = scenario.signalBase + Math.sin(index * 0.42) * 5;
    const signalEvent = eventAt(scenario.events, "signal", index);
    if (signalEvent) signal = signalEvent.value + Math.sin(index) * 2;
    readings.push({
      index,
      at: time,
      elapsedMinutes: index * intervalMinutes,
      stage: stageFor(index, scenario.points),
      temperature: round(temperature),
      humidity: round(humidity),
      battery: round(battery, 0),
      signal: round(Math.max(0, Math.min(100, signal)), 0),
      door
    });
  }
  return readings;
}

function detectPersistentRuns(readings, predicate, policy) {
  const escalated = [];
  const suppressed = [];
  let run = [];
  let clearCount = 0;

  const finish = () => {
    if (!run.length) return;
    const item = {
      start: run[0],
      end: run[run.length - 1],
      points: run.length,
      durationMinutes: Math.max(5, minutesBetween(run[0].at, run[run.length - 1].at) + 5)
    };
    (run.length >= policy.persistence ? escalated : suppressed).push(item);
    run = [];
    clearCount = 0;
  };

  for (const reading of readings) {
    if (predicate(reading)) {
      clearCount = 0;
      run.push(reading);
    } else if (run.length) {
      clearCount += 1;
      if (clearCount >= policy.clearPersistence) finish();
    }
  }
  finish();
  return { escalated, suppressed };
}

function alert(id, severity, title, evidence, run = null) {
  return { id, severity, title, evidence, run };
}

export function analyzeTelemetry(readings, policy = DEFAULT_POLICY) {
  if (!Array.isArray(readings) || readings.length < 2) throw new Error("At least two telemetry readings are required.");
  const alerts = [];
  const suppressions = [];
  const temperatureRuns = detectPersistentRuns(readings, (r) => r.temperature < policy.tempMin || r.temperature > policy.tempMax, policy);
  for (const [index, run] of temperatureRuns.escalated.entries()) {
    const values = readings.filter((reading) => reading.at >= run.start.at && reading.at <= run.end.at).map((reading) => reading.temperature);
    alerts.push(alert(`temperature-${index}`, "critical", "Temperature excursion persisted", `${run.points} breach readings across ${run.durationMinutes} minutes; observed ${Math.min(...values).toFixed(1)} to ${Math.max(...values).toFixed(1)} C against ${policy.tempMin}-${policy.tempMax} C policy.`, run));
  }
  for (const run of temperatureRuns.suppressed) suppressions.push({ id: `temp-spike-${run.start.index}`, title: "Temperature spike suppressed", evidence: `${run.points} breach reading did not meet the ${policy.persistence}-reading persistence rule.` });

  const humidityRuns = detectPersistentRuns(readings, (r) => r.humidity > policy.humidityMax, policy);
  for (const [index, run] of humidityRuns.escalated.entries()) alerts.push(alert(`humidity-${index}`, "warning", "Humidity threshold persisted", `${run.points} readings exceeded ${policy.humidityMax}% RH across ${run.durationMinutes} minutes.`, run));
  for (const run of humidityRuns.suppressed) suppressions.push({ id: `humidity-spike-${run.start.index}`, title: "Humidity spike suppressed", evidence: `${run.points} high reading did not meet persistence policy.` });

  const doorRuns = detectPersistentRuns(readings, (r) => r.door, { ...policy, persistence: Math.ceil(policy.doorMinutes / 5) });
  for (const [index, run] of doorRuns.escalated.entries()) alerts.push(alert(`door-${index}`, "warning", "Door-open interval persisted", `Door state remained open for ${run.durationMinutes} minutes against a ${policy.doorMinutes}-minute limit.`, run));

  const gaps = [];
  for (let index = 1; index < readings.length; index += 1) {
    const gap = minutesBetween(readings[index - 1].at, readings[index].at);
    if (gap > policy.maxGapMinutes) gaps.push({ from: readings[index - 1], to: readings[index], minutes: gap });
  }
  for (const [index, gap] of gaps.entries()) alerts.push(alert(`gap-${index}`, "critical", "Telemetry gap detected", `${gap.minutes} minutes elapsed between readings; policy allows ${policy.maxGapMinutes} minutes.`, { start: gap.from, end: gap.to, durationMinutes: gap.minutes, points: 0 }));

  const latest = readings[readings.length - 1];
  if (latest.battery < policy.batteryMin) alerts.push(alert("battery-low", "warning", "Sensor battery is low", `Latest battery is ${latest.battery}% against a ${policy.batteryMin}% floor.`));
  const signalRuns = detectPersistentRuns(readings, (r) => r.signal < policy.signalMin, policy);
  for (const [index, run] of signalRuns.escalated.entries()) alerts.push(alert(`signal-${index}`, "warning", "Weak signal persisted", `${run.points} readings remained below ${policy.signalMin}% signal.`, run));

  const temperatures = readings.map((r) => r.temperature);
  const expectedPoints = Math.round((minutesBetween(readings[0].at, readings[readings.length - 1].at) / 5) + 1);
  const metrics = {
    currentTemperature: latest.temperature,
    minTemperature: Math.min(...temperatures),
    maxTemperature: Math.max(...temperatures),
    currentHumidity: latest.humidity,
    currentBattery: latest.battery,
    currentSignal: latest.signal,
    openDoorPoints: readings.filter((r) => r.door).length,
    completeness: round(readings.length / expectedPoints * 100, 0),
    readings: readings.length
  };
  const critical = alerts.filter((item) => item.severity === "critical").length;
  return {
    status: critical ? "incident" : alerts.length ? "attention" : suppressions.length ? "observe" : "stable",
    alerts,
    suppressions,
    metrics,
    policy: { ...policy },
    explanation: `${policy.persistence} consecutive breach readings trigger; ${policy.clearPersistence} clear readings close a run.`
  };
}

export function buildIncidentExport(scenario, analysis, decision) {
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    synthetic: true,
    load: { id: scenario.loadId, title: scenario.title, cargo: scenario.cargo },
    outcome: { status: analysis.status, metrics: analysis.metrics, alerts: analysis.alerts, suppressions: analysis.suppressions },
    policy: analysis.policy,
    humanDecision: decision || null,
    limitations: [
      "Synthetic telemetry is not calibrated hardware evidence.",
      "Rules are transparent triage aids, not product-safety certification.",
      "A qualified operator owns disposition and escalation decisions."
    ]
  };
}
