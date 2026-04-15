import { Command } from "commander";
import { hostname, homedir } from "node:os";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { apiPost, apiGet } from "../../lib/api-client.js";
import { getApiUrl, getApiToken } from "../../lib/config-store.js";
import { success, error, warn, info } from "../../lib/output.js";
import { loadWatchConfig, type WatchEntry } from "./watch.js";
import { semanticSearch, grepSearch, fileReadSearch } from "./searcher.js";
import { hasClaudeCli, claudeSearch, claudeAnswer } from "./claude-searcher.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RegisterResponse {
  agentId: string;
  channel: string;
  orgId: string;
}

interface SearchTask {
  id: string;
  query: string;
  searchType: string;
  params: Record<string, unknown>;
  repoFullName: string;
  timeoutMs: number;
}

function parseGitRemote(url: string): string | null {
  const sshMatch = url.match(/git@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  const httpsMatch = url.match(/https?:\/\/[^/]+\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];
  return null;
}

function getGitRemoteUrl(dirPath: string): string | null {
  try {
    return execSync("git remote get-url origin", {
      cwd: dirPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Resolve watched directories to repo mappings.
 */
function resolveWatchedRepos(): Map<string, string> {
  const config = loadWatchConfig();
  const repoMap = new Map<string, string>(); // repoFullName -> localPath

  for (const entry of config.entries) {
    if (!existsSync(entry.path)) {
      warn(`Skipping ${entry.path} — directory not found`);
      continue;
    }

    const remoteUrl = getGitRemoteUrl(entry.path);
    if (!remoteUrl) {
      warn(`Skipping ${entry.path} — no git remote`);
      continue;
    }

    const fullName = parseGitRemote(remoteUrl);
    if (!fullName) {
      warn(`Skipping ${entry.path} — could not parse remote: ${remoteUrl}`);
      continue;
    }

    repoMap.set(fullName, entry.path);
  }

  return repoMap;
}

export const startCommand = new Command("start")
  .description("Start the local agent daemon")
  .option("--no-claude", "Disable Claude CLI (use ripgrep only)")
  .option("--with-claude", "[deprecated] Claude is now enabled by default. Use --no-claude to disable it.")
  .option("--verbose", "Run in foreground with detailed logs")
  .option("--foreground", "Run in foreground (without verbose logs)")
  .action(async (opts: { claude?: boolean; withClaude?: boolean; verbose?: boolean; foreground?: boolean }) => {
    if (opts.withClaude) {
      warn("--with-claude is deprecated and has no effect. Claude is now enabled by default. Use --no-claude to disable it.");
    }

    const token = getApiToken();
    if (!token) {
      error("Not logged in. Run 'octopus login' first.");
      process.exit(1);
    }

    const runInForeground = opts.verbose || opts.foreground;

    // Default: background mode — spawn detached child and exit
    if (!runInForeground) {
      // Detect if running as a compiled binary (Bun single-file executable)
      const isCompiledBinary = !process.execPath.includes("node") && !process.execPath.includes("bun") && existsSync(process.execPath);

      let execPath: string;
      let args: string[];

      if (isCompiledBinary) {
        execPath = process.execPath;
        args = ["agent", "start", "--foreground"];
      } else {
        // For npm-installed or dev usage, use process.argv[1] (the entry script)
        // which is more reliable than computing a relative path from __dirname
        const entryScript = process.argv[1];
        if (!entryScript || !existsSync(entryScript)) {
          // Fallback to __dirname-based resolution
          const binPath = join(__dirname, "..", "..", "..", "bin", "octopus.js");
          if (!existsSync(binPath)) {
            error(`Could not locate agent binary at: ${binPath}`);
            process.exit(1);
          }
          execPath = process.execPath;
          args = [binPath, "agent", "start", "--foreground"];
        } else {
          execPath = process.execPath;
          args = [entryScript, "agent", "start", "--foreground"];
        }
      }

      if (opts.claude === false) args.push("--no-claude");

      const child = spawn(execPath, args, {
        detached: true,
        stdio: "ignore",
      });

      child.on("error", (err) => {
        error(`Failed to start background agent: ${err.message}`);
        process.exit(1);
      });

      child.unref();

      // Write PID file for manageability
      const pidDir = join(homedir(), ".octopus");
      mkdirSync(pidDir, { recursive: true });
      const pidFile = join(pidDir, "agent.pid");
      writeFileSync(pidFile, String(child.pid));

      success(`Agent started in background (PID: ${child.pid})`);
      info(`PID saved to ${pidFile}. To stop: kill $(cat ${pidFile})`);
      process.exit(0);
    }

    // Resolve watched repos
    const repoMap = resolveWatchedRepos();
    if (repoMap.size === 0) {
      error("No watched repos found. Run 'octopus agent watch' in a repo directory first.");
      process.exit(1);
    }

    const repoFullNames = [...repoMap.keys()];
    info(`Found ${repoMap.size} watched repo(s):`);
    for (const [name, path] of repoMap) {
      console.log(`  ${chalk.cyan(name)} → ${path}`);
    }

    // Check Claude CLI availability (enabled by default, disable with --no-claude)
    const claudeAvailable = opts.claude !== false ? hasClaudeCli() : false;
    if (opts.claude !== false && !claudeAvailable) {
      warn("Claude CLI not found. Falling back to ripgrep mode.");
    }

    const capabilities = ["code-search"]; // ripgrep or Node.js fallback
    if (claudeAvailable) capabilities.push("claude-cli");

    const agentName = `${hostname()}-${process.pid}`;

    // Register with server
    let agentId: string;
    let orgId: string;
    try {
      const res = await apiPost<RegisterResponse>("/api/agent/register", {
        name: agentName,
        repoFullNames,
        capabilities,
        machineInfo: {
          os: process.platform,
          hostname: hostname(),
          nodeVersion: process.version,
        },
      });
      agentId = res.agentId;
      orgId = res.orgId;
      success(`Registered as "${agentName}" (${capabilities.join(", ")})`);
    } catch (err) {
      error(`Failed to register: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }

    const verbose = opts.verbose ?? false;

    // Heartbeat interval
    const heartbeatInterval = setInterval(async () => {
      try {
        // Re-scan repos in case they changed
        const freshMap = resolveWatchedRepos();
        const freshNames = [...freshMap.keys()];
        // Update our local map
        for (const [name, path] of freshMap) {
          repoMap.set(name, path);
        }
        await apiPost("/api/agent/heartbeat", {
          agentId,
          repoFullNames: freshNames,
        });
        if (verbose) {
          info(`Heartbeat sent (${freshNames.length} repos)`);
        }
      } catch (err: unknown) {
        if (verbose) {
          const e = err as { status?: number; url?: string; message?: string };
          warn(`Heartbeat failed: ${e.message}${e.status ? ` [${e.status}]` : ""}${e.url ? ` → ${e.url}` : ""}`);
        }
      }
    }, 30_000);

    // Task polling interval (fallback for missed Pubby signals)
    const pollInterval = setInterval(async () => {
      try {
        const res = await apiGet<{ tasks: SearchTask[] }>(
          `/api/agent/tasks?agentId=${agentId}`,
        );
        if (verbose && res.tasks.length > 0) {
          info(`Received ${res.tasks.length} task(s)`);
        }
        for (const task of res.tasks) {
          handleTask(task, repoMap, agentId, claudeAvailable, verbose);
        }
      } catch (err: unknown) {
        if (verbose) {
          const e = err as { status?: number; url?: string; message?: string };
          warn(`Poll failed: ${e.message}${e.status ? ` [${e.status}]` : ""}${e.url ? ` → ${e.url}` : ""}`);
        }
      }
    }, 2_000);

    // Graceful shutdown
    const cleanup = async () => {
      console.log("\n");
      info("Shutting down...");
      clearInterval(heartbeatInterval);
      clearInterval(pollInterval);

      try {
        await apiPost("/api/agent/disconnect", { agentId });
        success("Disconnected.");
      } catch {}

      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    console.log("");
    success(`Agent running. Listening for search requests...`);
    if (verbose) {
      info("Verbose mode enabled — showing all activity logs.");
      info(`Agent ID: ${agentId}`);
      info(`Repos: ${repoFullNames.join(", ")}`);
      info(`Polling every 2s, heartbeat every 30s`);
      info(`Press Ctrl+C to stop.\n`);
    } else {
      info(`Press Ctrl+C to stop.\n`);
    }
  });

/**
 * Handle a single search task — claim, execute, submit result.
 */
async function handleTask(
  task: SearchTask,
  repoMap: Map<string, string>,
  agentId: string,
  claudeAvailable: boolean,
  verbose: boolean,
): Promise<void> {
  const repoDir = repoMap.get(task.repoFullName);
  if (!repoDir) return;

  // Claim the task
  try {
    await apiPost(`/api/agent/tasks/${task.id}/claim`, { agentId });
  } catch {
    // Already claimed by another agent
    return;
  }

  if (verbose) {
    info(`Claimed task ${task.id}: "${task.query}" (${task.searchType}) in ${task.repoFullName}`);
  }

  try {
    let resultSummary: string;

    switch (task.searchType) {
      case "claude": {
        if (claudeAvailable) {
          try {
            resultSummary = await claudeSearch(task.query, repoDir, task.timeoutMs - 2000);
          } catch {
            // Fall back to semantic search
            if (verbose) warn("Claude CLI failed, falling back to ripgrep");
            const { summary } = await semanticSearch(task.query, repoDir);
            resultSummary = summary;
          }
        } else {
          const { summary } = await semanticSearch(task.query, repoDir);
          resultSummary = summary;
        }
        break;
      }

      case "grep": {
        const pattern = (task.params as { pattern?: string }).pattern ?? task.query;
        const { summary } = await grepSearch(pattern, repoDir);
        resultSummary = summary;
        break;
      }

      case "file-read": {
        const filePaths = (task.params as { filePaths?: string[] }).filePaths ?? [];
        const { summary } = await fileReadSearch(filePaths, repoDir);
        resultSummary = summary;
        break;
      }

      case "answer": {
        if (claudeAvailable) {
          resultSummary = await claudeAnswer(task, repoDir, Math.max(task.timeoutMs - 5000, 10_000));
        } else {
          throw new Error("Answer task requires Claude CLI");
        }
        break;
      }

      case "semantic":
      default: {
        const { summary } = await semanticSearch(task.query, repoDir);
        resultSummary = summary;
        break;
      }
    }

    // Submit results
    await apiPost(`/api/agent/tasks/${task.id}/result`, {
      results: [],
      resultSummary,
    });

    if (verbose) {
      success(`Completed task ${task.id} (${resultSummary.length} chars)`);
      console.log(chalk.dim("─".repeat(60)));
      console.log(resultSummary);
      console.log(chalk.dim("─".repeat(60)));
    } else {
      console.log(
        `${chalk.green("✓")} Searched "${task.query.slice(0, 50)}${task.query.length > 50 ? "..." : ""}" in ${chalk.cyan(task.repoFullName)}`,
      );
    }
  } catch (err) {
    // Submit error
    try {
      await apiPost(`/api/agent/tasks/${task.id}/result`, {
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    } catch {}

    if (verbose) {
      error(`Task ${task.id} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
