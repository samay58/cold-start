import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { webAppDir } from "./load-root-env.mjs";

export const devLockPath = path.join(webAppDir, ".cold-start", "next-dev.json");

export function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readActiveDevLock(lockPath = devLockPath, isAlive = isProcessRunning) {
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    return isAlive(lock.pid) ? lock : null;
  } catch {
    return null;
  }
}

export function writeDevLock(lockPath = devLockPath, pid = process.pid) {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, JSON.stringify({ pid, startedAt: new Date().toISOString() }), "utf8");
}

export function clearDevLock(lockPath = devLockPath, pid = process.pid) {
  const lock = readActiveDevLock(lockPath);

  if (lock && lock.pid !== pid) {
    return;
  }

  rmSync(lockPath, { force: true });
}

export function assertNoActiveDevServer(lockPath = devLockPath) {
  const lock = readActiveDevLock(lockPath);

  if (!lock) {
    return;
  }

  throw new Error(
    `Next dev is already running for apps/web (pid ${lock.pid}). Stop it before running next build so the shared .next directory is not corrupted.`
  );
}
