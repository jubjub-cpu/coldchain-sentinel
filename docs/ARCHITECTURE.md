# Architecture

## Runtime

ColdChain Sentinel is a dependency-free static web application. GitHub Pages serves HTML, CSS, JavaScript modules, and one JSON fixture manifest. There is no backend, build step, telemetry service, database, or model endpoint.

## Data flow

1. `data/scenarios.json` declares four deterministic synthetic drills and their injected conditions.
2. `generateReadings()` expands each declaration into timestamped temperature, humidity, battery, signal, door, and route-stage readings.
3. `analyzeTelemetry()` evaluates persistent runs, clear hysteresis, cadence gaps, battery, and signal against the active policy.
4. `assets/app.js` renders the fleet rail, metrics, canvas timeline, raw ledger, findings, controls, and local audit.
5. `buildIncidentExport()` packages the current analysis and human disposition into a portable JSON record.

No step transmits browser state.

## Analysis boundaries

The engine separates three evidence classes:

- **Alerts:** conditions that satisfy the configured persistence or independent sensor-health rule.
- **Suppressions:** threshold breaches that remain visible but do not satisfy persistence.
- **Human disposition:** an operator-authored acknowledgement or escalation stored separately from machine findings.

Temperature runs are critical because they model the primary policy condition. Humidity, door, battery, and signal findings are supporting warnings. A cadence gap is critical because absent evidence changes what the operator can safely conclude.

## Visual layer

The canvas plots temperature and humidity over synthetic elapsed time. The temperature policy band, breach points, door-open columns, and missing intervals use separate marks. The reading ledger remains the accessible textual source of truth; the canvas is not the only representation.

## Test strategy

- Unit tests assert exact outcomes for all scenarios and a policy sensitivity change.
- Static validation checks required evidence, disclosures, accessibility hooks, manifest coverage, privacy patterns, and engine execution.
- Playwright validates user workflows, downloaded evidence, rendered canvas pixels, responsive overflow, keyboard entry, network failures, and browser errors.
