import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

interface TestHarness {
  repoDir: string;
  supportDir: string;
  binDir: string;
  fakeBotScript: string;
}

interface WrapperHandle {
  child: ChildProcess;
  env: NodeJS.ProcessEnv;
  readonly output: string;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoots: string[] = [];
const childProcesses = new Set<ChildProcess>();

afterEach(async () => {
  for (const child of childProcesses) {
    await stopProcess(child);
  }
  childProcesses.clear();

  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true });
  }
}, 30000);

describe("self-deploy scripts", () => {
  it("commits untracked files before signaling restart", async () => {
    const harness = createHarness();
    const wrapper = startWrapper(harness, { MONITOR_SLEEP_INTERVAL: "30" });

    try {
      await waitFor(
        () =>
          existsSync(path.join(harness.repoDir, ".data", "wrapper.pid")) &&
          existsSync(path.join(harness.repoDir, ".data", "healthy")),
        8000,
        () => wrapper.output,
      );

      writeFileSync(path.join(harness.repoDir, "new-module.ts"), "export const deployed = true;\n");

      const previousHead = git(harness.repoDir, ["rev-parse", "HEAD"]);
      const output = runScript(
        harness.repoDir,
        path.join("scripts", "self-deploy.sh"),
        ["self-deploy: add new module"],
        createScriptEnv(harness),
      );

      expect(output).toContain("Deploy initiated successfully.");
      expect(git(harness.repoDir, ["rev-parse", "HEAD"])).not.toBe(previousHead);
      expect(git(harness.repoDir, ["show", "--no-patch", "--format=%s", "HEAD"])).toBe(
        "self-deploy: add new module",
      );
      expect(git(harness.repoDir, ["show", "--format=", "--name-only", "HEAD"])).toContain(
        "new-module.ts",
      );

      const rollbackTag = readFileSync(
        path.join(harness.repoDir, ".data", "rollback-tag"),
        "utf8",
      ).trim();
      expect(git(harness.repoDir, ["rev-parse", rollbackTag])).toBe(previousHead);
      expect(existsSync(path.join(harness.repoDir, ".data", "restart-requested"))).toBe(true);
    } finally {
      await stopProcess(wrapper.child);
    }
  }, 15000);

  it("fails fast when no wrapper is supervising the repo", () => {
    const harness = createHarness();
    const initialHead = git(harness.repoDir, ["rev-parse", "HEAD"]);

    writeFileSync(path.join(harness.repoDir, "new-module.ts"), "export const orphaned = true;\n");

    const failure = runScriptExpectFailure(
      harness.repoDir,
      path.join("scripts", "self-deploy.sh"),
      ["self-deploy: should fail"],
      createScriptEnv(harness),
    );

    expect(failure).toContain("run.sh is not supervising this repo");
    expect(existsSync(path.join(harness.repoDir, ".data", "restart-requested"))).toBe(false);
    expect(git(harness.repoDir, ["rev-parse", "HEAD"])).toBe(initialHead);
  });

  it("rejects stale wrapper metadata", async () => {
    const harness = createHarness();
    const sleeper = spawn("sleep", ["0.1"]);
    childProcesses.add(sleeper);

    mkdirSync(path.join(harness.repoDir, ".data"), { recursive: true });
    writeFileSync(path.join(harness.repoDir, ".data", "wrapper.pid"), `${sleeper.pid}\n`);

    await once(sleeper, "exit");
    childProcesses.delete(sleeper);

    const failure = runScriptExpectFailure(
      harness.repoDir,
      path.join("scripts", "self-deploy.sh"),
      ["self-deploy: stale pid"],
      createScriptEnv(harness),
    );

    expect(failure).toContain("run.sh is not supervising this repo");
    expect(existsSync(path.join(harness.repoDir, ".data", "restart-requested"))).toBe(false);
  });

  it("moves HEAD back to the rollback tag after a failed restart", async () => {
    const harness = createHarness();
    const wrapper = startWrapper(harness, {
      HEALTH_TIMEOUT: "2",
      HEALTH_POLL_INTERVAL: "0.1",
      MONITOR_SLEEP_INTERVAL: "0.1",
      SHUTDOWN_GRACE_PERIOD: "1",
    });

    try {
      await waitFor(
        () =>
          existsSync(path.join(harness.repoDir, ".data", "wrapper.pid")) &&
          existsSync(path.join(harness.repoDir, ".data", "healthy")),
        8000,
        () => wrapper.output,
      );

      const stableHead = git(harness.repoDir, ["rev-parse", "HEAD"]);
      writeFileSync(path.join(harness.repoDir, "bot-mode.txt"), "broken\n");
      git(harness.repoDir, ["commit", "-am", "bad deploy"]);

      const failedHead = git(harness.repoDir, ["rev-parse", "HEAD"]);
      expect(failedHead).not.toBe(stableHead);

      git(harness.repoDir, ["tag", "-f", "stable-test", stableHead]);
      writeFileSync(path.join(harness.repoDir, ".data", "rollback-tag"), "stable-test\n");
      writeFileSync(
        path.join(harness.repoDir, ".data", "restart-requested"),
        new Date().toISOString(),
      );

      await waitFor(
        () =>
          git(harness.repoDir, ["rev-parse", "HEAD"]) === stableHead &&
          readFileSync(path.join(harness.repoDir, "bot-mode.txt"), "utf8").trim() === "healthy" &&
          existsSync(path.join(harness.repoDir, ".data", "healthy")),
        10000,
        () => wrapper.output,
      );

      expect(git(harness.repoDir, ["branch", "--show-current"])).toBe("main");
      expect(existsSync(path.join(harness.repoDir, ".data", "rollback-tag"))).toBe(false);
    } finally {
      await stopProcess(wrapper.child);
    }
  }, 20000);
});

function createHarness(): TestHarness {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "discordjs-pi-self-deploy-"));
  tempRoots.push(tempRoot);

  const repoDir = path.join(tempRoot, "repo");
  const supportDir = path.join(tempRoot, "support");
  const binDir = path.join(supportDir, "bin");
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });

  copyFileSync(path.join(repoRoot, ".gitignore"), path.join(repoDir, ".gitignore"));
  mkdirSync(path.join(repoDir, "scripts"), { recursive: true });
  copyScript("run.sh", repoDir);
  copyScript("self-deploy.sh", repoDir);

  mkdirSync(path.join(repoDir, "src"), { recursive: true });
  writeFileSync(path.join(repoDir, "src", "index.ts"), "console.log('placeholder');\n");
  writeFileSync(path.join(repoDir, "bot-mode.txt"), "healthy\n");

  const fakeBotScript = path.join(supportDir, "fake-bot.sh");
  writeExecutable(
    fakeBotScript,
    `#!/usr/bin/env bash
set -euo pipefail

project_dir="$(pwd)"
health_file="$project_dir/.data/healthy"
mode="healthy"

if [[ -f "$project_dir/bot-mode.txt" ]]; then
  mode="$(tr -d '[:space:]' < "$project_dir/bot-mode.txt")"
fi

if [[ "$mode" == "healthy" ]]; then
  mkdir -p "$(dirname "$health_file")"
  printf '%s\\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$health_file"
fi

trap 'exit 0' TERM INT

while true; do
  sleep 0.1
done
`,
  );

  writeExecutable(
    path.join(binDir, "npx"),
    `#!/usr/bin/env bash
set -euo pipefail

command_name="\${1:-}"
if [[ -z "$command_name" ]]; then
  echo "missing npx command" >&2
  exit 1
fi
shift

case "$command_name" in
  tsc)
    exit "\${FAKE_TSC_EXIT_CODE:-0}"
    ;;
  vitest)
    exit "\${FAKE_VITEST_EXIT_CODE:-0}"
    ;;
  tsx)
    exec "$FAKE_BOT_SCRIPT"
    ;;
  *)
    echo "unexpected npx command: $command_name $*" >&2
    exit 1
    ;;
esac
`,
  );

  git(repoDir, ["init", "-b", "main"]);
  git(repoDir, ["config", "user.name", "Test User"]);
  git(repoDir, ["config", "user.email", "test@example.com"]);
  git(repoDir, ["add", "."]);
  git(repoDir, ["commit", "-m", "initial commit"]);

  return {
    repoDir,
    supportDir,
    binDir,
    fakeBotScript,
  };
}

function copyScript(scriptName: string, repoDir: string): void {
  const source = path.join(repoRoot, "scripts", scriptName);
  const destination = path.join(repoDir, "scripts", scriptName);
  copyFileSync(source, destination);
  chmodSync(destination, 0o755);
}

function writeExecutable(filePath: string, contents: string): void {
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function git(repoDir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoDir, encoding: "utf8" }).trim();
}

function runScript(
  repoDir: string,
  scriptPath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): string {
  return execFileSync(path.join(repoDir, scriptPath), args, {
    cwd: repoDir,
    env,
    encoding: "utf8",
  }).trim();
}

function runScriptExpectFailure(
  repoDir: string,
  scriptPath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): string {
  try {
    runScript(repoDir, scriptPath, args, env);
  } catch (error) {
    const result = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    const stdout = result.stdout ? result.stdout.toString() : "";
    const stderr = result.stderr ? result.stderr.toString() : "";
    return `${stdout}${stderr}`;
  }

  throw new Error(`${scriptPath} unexpectedly succeeded`);
}

function startWrapper(
  harness: TestHarness,
  overrides: Record<string, string>,
): WrapperHandle {
  const env = createScriptEnv(harness, overrides);

  const child = spawn(path.join(harness.repoDir, "scripts", "run.sh"), [], {
    cwd: harness.repoDir,
    detached: true,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (chunk: Buffer | string) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    output += chunk.toString();
  });

  childProcesses.add(child);

  return {
    child,
    env,
    get output() {
      return output;
    },
  };
}

function createScriptEnv(
  harness: TestHarness,
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FAKE_BOT_SCRIPT: harness.fakeBotScript,
    HEALTH_POLL_INTERVAL: "0.1",
    HEALTH_TIMEOUT: "2",
    MONITOR_SLEEP_INTERVAL: "0.1",
    NPX_BIN: path.join(harness.binDir, "npx"),
    PATH: `${harness.binDir}:${process.env.PATH ?? ""}`,
    SHUTDOWN_GRACE_PERIOD: "1",
    ...overrides,
  };
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    childProcesses.delete(child);
    return;
  }

  const exited = once(child, "exit");
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  } else {
    child.kill("SIGTERM");
  }

  const timedOut = sleep(2000).then(() => false);
  const exitedCleanly = await Promise.race([exited.then(() => true), timedOut]);

  if (!exitedCleanly) {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    } else {
      child.kill("SIGKILL");
    }
    await exited;
  }

  childProcesses.delete(child);
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  debug: () => string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await sleep(50);
  }

  throw new Error(`Timed out waiting for condition.\n${debug()}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
