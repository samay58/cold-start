#!/usr/bin/env tsx
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";

import { chromium, type Browser, type ConsoleMessage, type Page } from "@playwright/test";

import { browserbaseCardWithSynthesis, mockExtensionApi } from "../apps/extension/tests/e2e/fixtures";

type RouteMetric = {
  name: string;
  url: string;
  status: number | null;
  gotoMs: number;
  visibleMs: number;
  domContentLoadedMs: number | null;
  loadEventMs: number | null;
  layoutShiftScore: number;
  overflowCount: number;
  overflowSamples: string[];
  consoleErrors: number;
  pageErrors: number;
  appErrorCount: number;
};

type BundleMetric = {
  files: number;
  jsBytes: number;
  cssBytes: number;
  jsGzipBytes: number;
  cssGzipBytes: number;
};

type BenchmarkSummary = {
  webOrigin: string;
  extensionOrigin: string;
  routes: RouteMetric[];
  extensionBundle: BundleMetric | null;
  totalConsoleErrors: number;
  totalPageErrors: number;
  totalAppErrors: number;
  totalOverflowCount: number;
  slowestVisibleMs: number;
};

type StartedServer = {
  child: ChildProcessWithoutNullStreams;
  name: string;
  output: string[];
};

const DEFAULT_MIN_SCORE = 60;
const DEFAULT_TIMEOUT_MS = 45_000;
const WEB_READY_PATH = "/privacy";
const require = createRequire(import.meta.url);

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }

    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function loadEnv() {
  const explicit = argValue("--env-file");
  if (explicit) {
    loadEnvFile(resolve(process.cwd(), explicit));
  }
  loadEnvFile(resolve(process.cwd(), ".env.local"));
}

async function freePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port"));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

function timeoutMs() {
  return Number(argValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
}

function startServer(name: string, command: string, args: string[], cwd: string) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output: string[] = [];

  function capture(chunk: Buffer) {
    const text = chunk.toString();
    output.push(text);
    if (output.length > 80) {
      output.splice(0, output.length - 80);
    }
  }

  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  return { child, name, output };
}

async function stopServer(server: StartedServer) {
  if (server.child.exitCode !== null || server.child.killed) {
    return;
  }

  await new Promise<void>((resolveStop) => {
    const timer = setTimeout(() => {
      server.child.kill("SIGKILL");
      resolveStop();
    }, 2_000);
    server.child.once("exit", () => {
      clearTimeout(timer);
      resolveStop();
    });
    server.child.kill("SIGTERM");
  });
}

async function waitForHttp(url: string, server: StartedServer) {
  const deadline = Date.now() + timeoutMs();
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`${server.name} exited early with code ${server.child.exitCode}:\n${server.output.join("")}`);
    }

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 350));
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function navTiming(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return { domContentLoadedMs: null, loadEventMs: null };
  }

  const record = raw as { domContentLoadedEventEnd?: number; startTime?: number; loadEventEnd?: number };
  const start = typeof record.startTime === "number" ? record.startTime : 0;
  return {
    domContentLoadedMs: typeof record.domContentLoadedEventEnd === "number" ? Math.max(0, record.domContentLoadedEventEnd - start) : null,
    loadEventMs: typeof record.loadEventEnd === "number" ? Math.max(0, record.loadEventEnd - start) : null
  };
}

async function inspectPage(page: Page) {
  return await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const elements = Array.from(document.querySelectorAll("body *"));
    let overflowCount = 0;
    const overflowSamples: string[] = [];

    for (const element of elements) {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        rect.width < 24 ||
        rect.height < 8 ||
        rect.left > viewportWidth ||
        rect.top > viewportHeight ||
        rect.right < 0 ||
        rect.bottom < 0
      ) {
        continue;
      }

      if (htmlElement.scrollWidth > htmlElement.clientWidth + 2) {
        overflowCount += 1;
        if (overflowSamples.length < 8) {
          const className = typeof htmlElement.className === "string" ? htmlElement.className : "";
          const label = htmlElement.getAttribute("aria-label") ?? htmlElement.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "";
          overflowSamples.push(`${htmlElement.tagName.toLowerCase()}${className ? `.${className.split(/\s+/).filter(Boolean).join(".")}` : ""}${label ? `: ${label}` : ""}`);
        }
      }
    }

    const shifts = window.performance.getEntriesByType("layout-shift") as Array<{ value?: number; hadRecentInput?: boolean }>;
    const layoutShiftScore = shifts
      .filter((entry) => !entry.hadRecentInput)
      .reduce((sum, entry) => sum + (entry.value ?? 0), 0);

    return {
      appErrorCount: document.body.innerText.match(/Application error|Unhandled Runtime Error|Internal Server Error/gi)?.length ?? 0,
      layoutShiftScore,
      overflowCount,
      overflowSamples,
      timing: window.performance.getEntriesByType("navigation")[0]?.toJSON?.() ?? null
    };
  });
}

async function installBenchmarkChromeShim(page: Page) {
  await page.addInitScript({
    content: `
      (() => {
        const stores = {
          local: {
            coldStartApiOrigin: "https://cold-start.local",
            coldStartApiToken: "local-test-token"
          },
          session: {
            activeDomain: "browserbase.com"
          }
        };
        const listeners = new Set();

        function pick(area, keys) {
          const store = stores[area];
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, store[key]]));
          }
          if (typeof keys === "string") {
            return { [keys]: store[keys] };
          }
          if (keys && typeof keys === "object") {
            return Object.fromEntries(Object.keys(keys).map((key) => [key, store[key] ?? keys[key]]));
          }
          return { ...store };
        }

        function storageArea(area) {
          return {
            get(keys, callback) {
              callback(pick(area, keys));
            },
            set(items, callback) {
              const changes = {};
              for (const [key, value] of Object.entries(items)) {
                changes[key] = { oldValue: stores[area][key], newValue: value };
                stores[area][key] = value;
              }
              for (const listener of listeners) {
                listener(changes, area);
              }
              callback?.();
            }
          };
        }

        window.chrome = {
          runtime: { id: "extension-test-id" },
          storage: {
            local: storageArea("local"),
            session: storageArea("session"),
            onChanged: {
              addListener(listener) {
                listeners.add(listener);
              },
              removeListener(listener) {
                listeners.delete(listener);
              }
            }
          }
        };
      })();
    `
  });
}

async function measureRoute(input: {
  browser: Browser;
  name: string;
  url: string;
  readyText: RegExp;
  setup?: (page: Page) => Promise<void>;
  screenshotPath?: string;
}) {
  const context = await input.browser.newContext({ viewport: input.name === "extension-sidepanel" ? { width: 420, height: 900 } : { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const consoleErrors: ConsoleMessage[] = [];
  const pageErrors: Error[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error));

  await input.setup?.(page);

  const gotoStart = performance.now();
  const response = await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: timeoutMs() });
  const gotoMs = performance.now() - gotoStart;
  try {
    await page.getByText(input.readyText).first().waitFor({ state: "visible", timeout: timeoutMs() });
  } catch (error) {
    if (input.screenshotPath) {
      mkdirSync(dirname(input.screenshotPath), { recursive: true });
      await page.screenshot({ fullPage: true, path: input.screenshotPath.replace(/\.png$/, "-failed.png") });
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const diagnostics = [
        `body:\n${bodyText}`,
        `consoleErrors:\n${consoleErrors.map((message) => message.text()).join("\n")}`,
        `pageErrors:\n${pageErrors.map((pageError) => pageError.stack ?? pageError.message).join("\n")}`
      ].join("\n\n");
      writeFileSync(input.screenshotPath.replace(/\.png$/, "-failed.txt"), diagnostics);
    }
    throw error;
  }
  const visibleMs = performance.now() - gotoStart;
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  const inspected = await inspectPage(page);

  if (input.screenshotPath) {
    mkdirSync(dirname(input.screenshotPath), { recursive: true });
    await page.screenshot({ fullPage: true, path: input.screenshotPath });
  }

  await context.close();

  return {
    name: input.name,
    url: input.url,
    status: response?.status() ?? null,
    gotoMs: Number(gotoMs.toFixed(1)),
    visibleMs: Number(visibleMs.toFixed(1)),
    ...navTiming(inspected.timing),
    layoutShiftScore: Number(inspected.layoutShiftScore.toFixed(4)),
    overflowCount: inspected.overflowCount,
    overflowSamples: inspected.overflowSamples,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length,
    appErrorCount: inspected.appErrorCount
  };
}

async function extensionBundleMetric() {
  if (hasArg("--skip-extension-build")) {
    return null;
  }

  const build = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "-w", "@cold-start/extension"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output: string[] = [];
  build.stdout.on("data", (chunk) => output.push(chunk.toString()));
  build.stderr.on("data", (chunk) => output.push(chunk.toString()));

  await new Promise<void>((resolveBuild, reject) => {
    build.once("exit", (code) => {
      if (code === 0) {
        resolveBuild();
        return;
      }
      reject(new Error(`extension build failed:\n${output.join("")}`));
    });
  });

  const assetsDir = resolve(process.cwd(), "apps/extension/dist/assets");
  const files = existsSync(assetsDir) ? await readdir(assetsDir) : [];
  const metric: BundleMetric = { files: 0, jsBytes: 0, cssBytes: 0, jsGzipBytes: 0, cssGzipBytes: 0 };

  for (const file of files) {
    if (!file.endsWith(".js") && !file.endsWith(".css")) {
      continue;
    }
    const path = join(assetsDir, file);
    const bytes = statSync(path).size;
    const gzipBytes = gzipSync(readFileSync(path)).byteLength;
    metric.files += 1;
    if (file.endsWith(".js")) {
      metric.jsBytes += bytes;
      metric.jsGzipBytes += gzipBytes;
    } else {
      metric.cssBytes += bytes;
      metric.cssGzipBytes += gzipBytes;
    }
  }

  return metric;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function score(summary: BenchmarkSummary) {
  const routeSpeed = summary.routes.reduce((sum, route) => {
    const target = route.name === "extension-sidepanel" ? 1_800 : 2_800;
    return sum + clamp(1 - route.visibleMs / target, 0, 1);
  }, 0) / Math.max(1, summary.routes.length);

  const dclSpeed = summary.routes.reduce((sum, route) => {
    const value = route.domContentLoadedMs ?? route.gotoMs;
    return sum + clamp(1 - value / 2_200, 0, 1);
  }, 0) / Math.max(1, summary.routes.length);

  const bundle = summary.extensionBundle;
  const bundleScore = bundle ? clamp(1 - bundle.jsGzipBytes / 360_000, 0, 1) : 0.7;
  const reliabilityPenalty = Math.min(40, summary.totalConsoleErrors * 4 + summary.totalPageErrors * 12 + summary.totalAppErrors * 20);
  const overflowPenalty = Math.min(15, summary.totalOverflowCount * 1.5);
  const layoutPenalty = Math.min(10, summary.routes.reduce((sum, route) => sum + route.layoutShiftScore, 0) * 25);

  return Number((
    50 * routeSpeed +
    20 * dclSpeed +
    20 * bundleScore +
    10 * clamp(1 - summary.slowestVisibleMs / 4_500, 0, 1) -
    reliabilityPenalty -
    overflowPenalty -
    layoutPenalty
  ).toFixed(4));
}

async function writeEvoResult(payload: unknown) {
  const resultPath = process.env.EVO_RESULT_PATH;
  if (resultPath) {
    await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  }
}

function artifactPath(name: string) {
  const dir = argValue("--artifacts-dir") ?? process.env.EVO_ARTIFACTS_DIR;
  return dir ? resolve(process.cwd(), dir, `${name}.png`) : undefined;
}

async function main() {
  loadEnv();

  const webPort = Number(argValue("--web-port")) || await freePort();
  const extensionPort = Number(argValue("--extension-port")) || await freePort();
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const extensionOrigin = `http://127.0.0.1:${extensionPort}`;
  const nodeBin = process.execPath;
  const nextBin = require.resolve("next/dist/bin/next");
  const viteBin = resolve(dirname(require.resolve("vite/package.json")), "bin/vite.js");
  const webServer = startServer("next", nodeBin, [nextBin, "dev", "-p", String(webPort), "--hostname", "127.0.0.1"], resolve(process.cwd(), "apps/web"));
  const extensionServer = startServer("extension-vite", nodeBin, [viteBin, "--config", "vite.sidepanel.config.ts", "--host", "127.0.0.1", "--port", String(extensionPort), "--strictPort"], resolve(process.cwd(), "apps/extension"));

  let browser: Browser | null = null;
  try {
    await Promise.all([
      waitForHttp(`${webOrigin}${WEB_READY_PATH}`, webServer),
      waitForHttp(`${extensionOrigin}/sidepanel.html`, extensionServer)
    ]);

    browser = await chromium.launch();
    const cardSlug = argValue("--card-slug") ?? "cartesia";
    const routes = await Promise.all([
      measureRoute({
        browser,
        name: "web-home",
        readyText: /Cold Start|Companies|No sourced profiles yet/i,
        screenshotPath: artifactPath("web-home"),
        url: `${webOrigin}/`
      }),
      measureRoute({
        browser,
        name: "web-public-card",
        readyText: /Cold Start|Sourced company context|Cartesia|Browserbase|not found/i,
        screenshotPath: artifactPath("web-public-card"),
        url: `${webOrigin}/c/${cardSlug}`
      }),
      measureRoute({
        browser,
        name: "extension-sidepanel",
        readyText: /Research layer|Browserbase turns browser automation/i,
        screenshotPath: artifactPath("extension-sidepanel"),
        setup: async (page) => {
          await installBenchmarkChromeShim(page);
          await mockExtensionApi(page, browserbaseCardWithSynthesis());
        },
        url: `${extensionOrigin}/sidepanel.html`
      })
    ]);
    const extensionBundle = await extensionBundleMetric();
    const summary: BenchmarkSummary = {
      webOrigin,
      extensionOrigin,
      routes,
      extensionBundle,
      totalConsoleErrors: routes.reduce((sum, route) => sum + route.consoleErrors, 0),
      totalPageErrors: routes.reduce((sum, route) => sum + route.pageErrors, 0),
      totalAppErrors: routes.reduce((sum, route) => sum + route.appErrorCount, 0),
      totalOverflowCount: routes.reduce((sum, route) => sum + route.overflowCount, 0),
      slowestVisibleMs: Math.max(...routes.map((route) => route.visibleMs))
    };
    const benchmarkScore = score(summary);
    const result = {
      score: benchmarkScore,
      metric: "cold_start_ux_speed_reliability",
      direction: "max",
      summary
    };

    const artifactsDir = argValue("--artifacts-dir") ?? process.env.EVO_ARTIFACTS_DIR;
    if (artifactsDir) {
      mkdirSync(resolve(process.cwd(), artifactsDir), { recursive: true });
      writeFileSync(resolve(process.cwd(), artifactsDir, "ux-benchmark.json"), `${JSON.stringify(result, null, 2)}\n`);
    }

    await writeEvoResult(result);

    if (hasArg("--json") || process.env.EVO_RESULT_PATH) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`score: ${benchmarkScore}`);
      console.log(JSON.stringify(summary, null, 2));
    }

    const minScore = Number(argValue("--min-score") ?? DEFAULT_MIN_SCORE);
    if (hasArg("--gate") && (!Number.isFinite(minScore) || benchmarkScore < minScore)) {
      throw new Error(`UX benchmark score ${benchmarkScore} is below gate ${minScore}`);
    }
  } finally {
    await browser?.close();
    await Promise.all([stopServer(webServer), stopServer(extensionServer)]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
