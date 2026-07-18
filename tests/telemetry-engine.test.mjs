import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { DEFAULT_POLICY, analyzeTelemetry, buildIncidentExport, generateReadings } from "../assets/telemetry-engine.mjs";

const manifest = JSON.parse(await fs.readFile(new URL("../data/scenarios.json", import.meta.url), "utf8"));
const byId = Object.fromEntries(manifest.scenarios.map((scenario) => [scenario.id, scenario]));
const analyze = (id, policy = DEFAULT_POLICY) => {
  const readings = generateReadings(byId[id]);
  return { readings, result: analyzeTelemetry(readings, policy) };
};

assert.equal(manifest.scenarios.length, 4);

const stable = analyze("stable-load");
assert.equal(stable.readings.length, 48);
assert.equal(stable.result.status, "stable");
assert.equal(stable.result.alerts.length, 0);
assert.equal(stable.result.suppressions.length, 0);

const spike = analyze("spike-drill");
assert.equal(spike.result.status, "observe");
assert.equal(spike.result.alerts.length, 0);
assert.equal(spike.result.suppressions.length, 1);
assert.match(spike.result.suppressions[0].title, /suppressed/i);

const spikeSensitive = analyze("spike-drill", { ...DEFAULT_POLICY, persistence: 1 });
assert.ok(spikeSensitive.result.alerts.some((item) => item.id.startsWith("temperature")));
assert.equal(spikeSensitive.result.suppressions.length, 0);

const excursion = analyze("dock-excursion");
assert.equal(excursion.result.status, "incident");
assert.ok(excursion.result.alerts.some((item) => item.title === "Temperature excursion persisted"));
assert.ok(excursion.result.alerts.some((item) => item.title === "Humidity threshold persisted"));
assert.ok(excursion.result.alerts.some((item) => item.title === "Door-open interval persisted"));
assert.ok(excursion.result.metrics.maxTemperature > 10);
assert.equal(excursion.result.metrics.openDoorPoints, 9);

const sensor = analyze("sensor-dropout");
assert.equal(sensor.readings.length, 44);
assert.equal(sensor.result.status, "incident");
assert.ok(sensor.result.alerts.some((item) => item.title === "Telemetry gap detected"));
assert.ok(sensor.result.alerts.some((item) => item.title === "Sensor battery is low"));
assert.ok(sensor.result.alerts.some((item) => item.title === "Weak signal persisted"));
assert.ok(sensor.result.metrics.completeness < 100);

const decision = { action: "escalated", note: "Qualified operator review required.", at: "2026-07-14T15:00:00.000Z" };
const exported = buildIncidentExport(byId["dock-excursion"], excursion.result, decision);
assert.equal(exported.synthetic, true);
assert.equal(exported.humanDecision.action, "escalated");
assert.ok(exported.outcome.alerts.length >= 3);
assert.equal(exported.limitations.length, 3);

assert.throws(() => analyzeTelemetry([], DEFAULT_POLICY), /At least two/);

console.log("COLDCHAIN ENGINE TESTS PASSED");
console.log(JSON.stringify({ scenarios: 4, persistentExcursion: true, spikeSuppression: true, hysteresis: true, sensorGap: true, humanExport: true }));
