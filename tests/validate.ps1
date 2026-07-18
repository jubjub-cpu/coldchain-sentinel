param([string]$NodePath = "")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$failures = New-Object System.Collections.Generic.List[string]
$required = @(
  "index.html", "assets/styles.css", "assets/app.js", "assets/telemetry-engine.mjs",
  "data/scenarios.json", "tests/telemetry-engine.test.mjs", "tests/browser-smoke.mjs",
  "tests/validate.ps1", "tools/static-server.mjs", "tools/static-server.ps1", "README.md",
  "docs/ARCHITECTURE.md", "docs/CASE_STUDY.md", "docs/RELEASE_NOTES.md", "docs/VALIDATION.md",
  "docs/screenshots/coldchain-sentinel-desktop.png", "docs/screenshots/coldchain-sentinel-mobile.png",
  "package.json", "LICENSE", ".gitignore", ".env.example", ".nojekyll"
)
foreach ($file in $required) { if (-not (Test-Path -LiteralPath (Join-Path $root $file))) { $failures.Add("Missing required file: $file") } }

try {
  $manifest = Get-Content -Raw -LiteralPath (Join-Path $root "data/scenarios.json") | ConvertFrom-Json
  if ($manifest.scenarios.Count -ne 4) { $failures.Add("Exactly four synthetic telemetry scenarios are required.") }
  $ids = @($manifest.scenarios.id)
  foreach ($id in @("stable-load", "spike-drill", "dock-excursion", "sensor-dropout")) { if ($ids -notcontains $id) { $failures.Add("Scenario missing: $id") } }
  if ($manifest.notice -notmatch "deterministic synthetic") { $failures.Add("Synthetic-data disclosure missing from scenario manifest.") }
} catch { $failures.Add("Scenario manifest is invalid JSON.") }

$html = Get-Content -Raw -LiteralPath (Join-Path $root "index.html")
foreach ($hook in @('<meta name="viewport"', 'class="skip-link"', 'id="workspace"', 'aria-live=', 'type="module"')) { if ($html -notmatch [Regex]::Escape($hook)) { $failures.Add("index.html missing $hook") } }

$files = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.FullName -notmatch "\.git\\" -and $_.FullName -ne $MyInvocation.MyCommand.Path -and $_.Extension -in @(".html", ".css", ".js", ".mjs", ".json", ".md", ".txt", ".example") }
$text = ($files | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
foreach ($pattern in @("(?i)gmail\.com", "sk-[A-Za-z0-9]{20,}", "gh[opsu]_[A-Za-z0-9]{20,}", "BEGIN (RSA|OPENSSH) PRIVATE KEY")) { if ($text -match $pattern) { $failures.Add("Potential private information or secret found: $pattern") } }
foreach ($phrase in @("synthetic", "persistence", "hysteresis", "human", "No driver", "not product-safety certification")) { if ($text -notmatch [Regex]::Escape($phrase)) { $failures.Add("Disclosure phrase missing: $phrase") } }

if (-not $NodePath) { $node = Get-Command node -ErrorAction SilentlyContinue; if ($node) { $NodePath = $node.Source } }
if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath)) { $failures.Add("Node.js not found; pass -NodePath.") } else { & $NodePath (Join-Path $root "tests/telemetry-engine.test.mjs"); if ($LASTEXITCODE -ne 0) { $failures.Add("Telemetry engine tests failed.") } }

if ($failures.Count) { Write-Host "COLDCHAIN VALIDATION FAILED"; foreach ($failure in $failures) { Write-Host "- $failure" }; exit 1 }
Write-Host "COLDCHAIN VALIDATION PASSED"
Write-Host "Checked files, scenario coverage, disclosures, privacy patterns, accessibility hooks, and telemetry analysis logic."
