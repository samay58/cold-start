import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rm, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";

type AgentcashRun = (command: string, args: string[], options: { timeoutMs: number }) => Promise<string>;

type AgentCashJsonInput = {
  url: string;
  body: Record<string, unknown>;
  command?: string;
  packageName?: string;
  timeoutMs?: number;
  runAgentcash?: AgentcashRun;
};

export async function agentcashJson<T>(input: AgentCashJsonInput): Promise<T> {
  const { command, args } = buildAgentcashFetchCommand(input);
  const timeoutMs = input.timeoutMs ?? 120_000;
  const stdout = await (input.runAgentcash ?? runAgentcashCommand)(command, args, { timeoutMs });

  return parseAgentcashOutput<T>(stdout);
}

export function buildAgentcashFetchCommand(input: Pick<AgentCashJsonInput, "url" | "body" | "command" | "packageName">) {
  const overrideCommand = input.command ?? process.env.AGENTCASH_BIN;
  if (overrideCommand) {
    return {
      command: overrideCommand,
      args: buildAgentcashFetchArgs({ ...input, command: overrideCommand }),
    };
  }

  return {
    command: process.execPath,
    args: [agentcashCliPath(), ...buildAgentcashFetchArgs({ ...input, command: "agentcash" })],
  };
}

export function buildAgentcashFetchArgs(input: Pick<AgentCashJsonInput, "url" | "body" | "command" | "packageName">) {
  const command = input.command ?? process.env.AGENTCASH_BIN ?? "agentcash";
  const packageName = input.packageName ?? process.env.AGENTCASH_PACKAGE ?? "agentcash@0.14.4";
  const fetchArgs = [
    "fetch",
    input.url,
    "-m",
    "POST",
    "-b",
    JSON.stringify(input.body),
    "-y",
    "--format",
    "json",
  ];

  return command === "npx" ? [packageName, ...fetchArgs] : fetchArgs;
}

export function parseAgentcashOutput<T>(stdout: string): T {
  const parsed = JSON.parse(stdout) as unknown;

  if (parsed && typeof parsed === "object" && "success" in parsed) {
    const envelope = parsed as { success: boolean; data?: T; error?: { message?: string } | string };

    if (!envelope.success) {
      const message =
        typeof envelope.error === "string"
          ? envelope.error
          : envelope.error?.message ?? "AgentCash request failed";
      throw new Error(message);
    }

    return envelope.data as T;
  }

  return parsed as T;
}

async function runAgentcashCommand(command: string, args: string[], options: { timeoutMs: number }): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "cold-start-agentcash-"));
  const childEnv = agentcashChildEnv({ fallbackHome: join(tempDir, "home") });
  const stdoutPath = join(tempDir, "stdout.json");
  const stderrPath = join(tempDir, "stderr.log");
  const stdout = await open(stdoutPath, "w");
  const stderr = await open(stderrPath, "w");

  try {
    if (childEnv.HOME) {
      await mkdir(childEnv.HOME, { recursive: true });
    }

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(command, args, {
        env: childEnv,
        stdio: ["ignore", stdout.fd, stderr.fd],
      });
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`AgentCash command timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);

      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    await stdout.close();
    await stderr.close();

    const output = await readFile(stdoutPath, "utf8");
    if (exitCode !== 0) {
      const detail = (await readFile(stderrPath, "utf8")).trim() || output.trim() || `exit code ${exitCode}`;
      throw new Error(`AgentCash command failed: ${detail}`);
    }

    return output;
  } finally {
    await Promise.allSettled([stdout.close(), stderr.close()]);
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function agentcashChildEnv(input: { baseEnv?: NodeJS.ProcessEnv; fallbackHome: string }): NodeJS.ProcessEnv {
  const baseEnv = input.baseEnv ?? process.env;
  const configuredHome = baseEnv.AGENTCASH_HOME?.trim() || baseEnv.HOME?.trim();
  const home = configuredHome && existsSync(configuredHome) ? configuredHome : input.fallbackHome;

  return {
    ...baseEnv,
    HOME: home,
  };
}

export function resolveAgentcashCliPath(startDir = process.cwd()) {
  const packageRelativePath = join("node_modules", "agentcash", "dist", "esm", "index.js");

  for (const dir of ancestorDirs(startDir)) {
    const candidate = join(dir, packageRelativePath);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const require = createRequire(import.meta.url);
    const candidate = join(dirname(require.resolve("agentcash/package.json")), "dist", "esm", "index.js");
    if (existsSync(candidate)) {
      return candidate;
    }
  } catch {
    // Bundlers can rewrite createRequire/import.meta into non-filesystem module ids.
  }

  throw new Error("Installed AgentCash CLI not found. Run npm install in the workspace root or set AGENTCASH_BIN.");
}

function agentcashCliPath() {
  return resolveAgentcashCliPath();
}

function ancestorDirs(startDir: string) {
  const dirs: string[] = [];
  let current = resolve(startDir);
  const root = parse(current).root;

  while (true) {
    dirs.push(current);
    if (current === root) {
      return dirs;
    }
    current = dirname(current);
  }
}
