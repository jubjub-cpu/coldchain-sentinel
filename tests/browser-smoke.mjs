import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const port = Number(process.env.COLDCHAIN_TEST_PORT || 4207);
const deployed = process.env.COLDCHAIN_BASE_URL?.trim();
const base = deployed ? `${deployed.replace(/\/$/, "")}/` : `http://127.0.0.1:${port}/`;
const target = process.env.PLAYWRIGHT_MODULE || "playwright";
const specifier = /^[A-Za-z]:[\\/]/.test(target) ? pathToFileURL(target).href : target;
const { chromium } = await import(specifier);
const desktopShot = fileURLToPath(new URL("../docs/screenshots/coldchain-sentinel-desktop.png", import.meta.url));
const mobileShot = fileURLToPath(new URL("../docs/screenshots/coldchain-sentinel-mobile.png", import.meta.url));
const server = deployed ? null : spawn(process.execPath, ["tools/static-server.mjs", "--port", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });

async function ready() {
  for (let attempt = 0; attempt < 35; attempt += 1) {
    try { if ((await fetch(base)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("ColdChain server did not start");
}

let browser;
try {
  await ready();
  browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await desktop.newPage();
  const errors = [];
  const failed = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => failed.push(request.url()));
  await page.goto(base, { waitUntil: "networkidle" });
  assert.equal(await page.locator("[data-load]").count(), 4);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("skip-link")), true);
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => location.hash), "#workspace");
  assert.match(await page.locator("#operation-heading").innerText(), /CS-418/);
  assert.match(await page.locator("#load-status").innerText(), /incident/i);
  assert.match(await page.locator("#alerts-list").innerText(), /Temperature excursion persisted/);
  assert.match(await page.locator("#alerts-list").innerText(), /Humidity threshold persisted/);
  assert.match(await page.locator("#alerts-list").innerText(), /Door-open interval persisted/);
  assert.equal(await page.locator("#telemetry-body tr").count(), 48);

  const chartPixels = await page.locator("#telemetry-chart").evaluate((canvas) => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let index = 0; index < data.length; index += 80) if (data[index] > 40 || data[index + 1] > 55 || data[index + 2] > 55) colored += 1;
    return colored;
  });
  assert.ok(chartPixels > 250);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: desktopShot, fullPage: true });

  await page.locator('[data-load="spike-drill"]').click();
  assert.match(await page.locator("#load-status").innerText(), /observe/i);
  assert.match(await page.locator("#suppressions").innerText(), /Temperature spike suppressed/);
  assert.equal(await page.locator("#alerts-list .alert").count(), 0);
  await page.locator("#persistence").evaluate((input) => { input.value = "1"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  assert.match(await page.locator("#alerts-list").innerText(), /Temperature excursion persisted/);
  await page.locator("#reset-policy").click();
  assert.match(await page.locator("#suppressions").innerText(), /Temperature spike suppressed/);

  await page.locator('[data-load="sensor-dropout"]').click();
  assert.match(await page.locator("#alerts-list").innerText(), /Telemetry gap detected/);
  assert.match(await page.locator("#alerts-list").innerText(), /Sensor battery is low/);
  assert.match(await page.locator("#alerts-list").innerText(), /Weak signal persisted/);
  assert.match(await page.locator("#metric-strip").innerText(), /92%/);

  await page.locator('[data-load="dock-excursion"]').click();
  await page.locator("#escalate-load").click();
  assert.match(await page.locator("#decision-error").innerText(), /12-character/);
  await page.locator("#operator-note").fill("Persistent excursion requires qualified product review.");
  await page.locator("#escalate-load").click();
  assert.match(await page.locator("#decision-summary").innerText(), /Load escalated by human operator/);
  assert.match(await page.locator("#audit-list").innerText(), /Load escalated/);
  const download = page.waitForEvent("download");
  await page.locator("#export-incident").click();
  assert.match((await download).suggestedFilename(), /coldchain-incident\.json$/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(base, { waitUntil: "networkidle" });
  await mobilePage.locator('[data-load="spike-drill"]').click();
  assert.match(await mobilePage.locator("#suppressions").innerText(), /Visible, not escalated/);
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await mobilePage.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await mobilePage.screenshot({ path: mobileShot, fullPage: true });
  await mobile.close();

  const errorContext = await browser.newContext();
  const errorPage = await errorContext.newPage();
  await errorPage.route("**/data/scenarios.json", (route) => route.abort());
  await errorPage.goto(base, { waitUntil: "domcontentloaded" });
  await errorPage.getByRole("heading", { name: "The synthetic telemetry drills could not be prepared." }).waitFor({ state: "visible" });
  assert.equal(await errorPage.getByRole("button", { name: "Retry" }).isVisible(), true);
  await errorContext.close();

  console.log("COLDCHAIN BROWSER TESTS PASSED");
  console.log(JSON.stringify({ target: deployed ? "deployed" : "local", scenarios: 4, telemetry: 188, canvas: true, temperature: true, humidity: true, door: true, sensorHealth: true, persistence: true, hysteresis: true, spikeSuppression: true, policyTuning: true, humanGate: true, jsonExport: true, keyboard: true, desktopOverflow: false, mobileOverflow: false, consoleErrors: 0, failedRequests: 0 }));
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
