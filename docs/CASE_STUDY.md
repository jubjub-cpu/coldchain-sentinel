# Case Study: Making Alert Persistence Inspectable

## Challenge

A cold-chain dashboard can look convincing while hiding the rule that matters most: when a threshold point becomes an incident. Immediate alarms create fatigue; aggressive smoothing can hide evidence; and a clean chart can overstate confidence when the sensor itself is unhealthy.

## Product decision

ColdChain Sentinel makes the alert contract part of the workspace. Consecutive breach readings are required for escalation, consecutive clear readings close a run, and short runs appear in a suppression area. The same workspace shows telemetry gaps, signal strength, and battery so cargo-condition evidence is not separated from evidence quality.

## Implementation

Four fixture declarations generate deterministic five-minute series. The stable load establishes a control. The spike drill proves that one anomalous point stays visible without becoming an alert. The dock-door drill correlates temperature, humidity, and door state. The sensor-health drill removes four expected readings and degrades battery and signal.

Every policy change re-evaluates every load. Changing persistence from three readings to one turns the spike drill into an active temperature alert, making sensitivity visible rather than theoretical.

## Human factors

Machine findings cannot dispose a shipment. A reviewer must enter a meaningful note before acknowledging or escalating. Export preserves the raw alert identifiers, configured policy, synthetic-data flag, limitations, and reviewer decision as separate fields.

## Outcome

The result is an operational portfolio piece that demonstrates time-series generation, stateful anomaly logic, hysteresis, data-quality monitoring, Canvas visualization, responsive frontend work, evidence export, and explicit automation boundaries in one deployable static product.

## What this does not claim

The console is not product-safety certification, a calibrated device, a regulated record, or a substitute for trained operational review. It does not ingest production telemetry or represent real facilities, vehicles, cargo, customers, or people.
