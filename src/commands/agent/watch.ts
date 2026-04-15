import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import chalk from "chalk";
import { success, error, warn, info, heading, table } from "../../lib/output.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG_DIR = join(homedir(), ".octopus");
const WATCH_FILE = join(CONFIG_DIR, "agent-watch.json");

interface WatchEntry {
  path: string;
  remoteUrl: string;
  repoFullName: string;
  addedAt: string;
}

interface WatchConfig {
  entries: WatchEntry[];
}

function loadWatchConfig(): WatchConfig {
  try {
    const data = readFileSync(WATCH_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { entries: [] };
  }
}

function saveWatchConfig(config: WatchConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(WATCH_FILE, JSON.stringify(config, null, 2));
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

function parseGitRemote(url: string): string | null {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/https?:\/\/[^/]+\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];

  return null;
}

export { loadWatchConfig, type WatchEntry };

export const watchCommand = new Command("watch")
  .description("Manage watched directories for local agent")
  .argument("[path]", "Directory to watch (defaults to current directory)")
  .option("--list", "List all watched directories")
  .option("--remove", "Remove directory from watch list")
  .option("--no-start", "Don't auto-start the agent after adding")
  .option("--verbose", "Start agent in foreground with detailed logs")
  .action(async (pathArg: string | undefined, opts: { list?: boolean; remove?: boolean; start?: boolean; verbose?: boolean }) => {
    if (opts.list) {
      const config = loadWatchConfig();
      if (config.entries.length === 0) {
        info("No watched directories. Run 'octopus agent watch' in a repo directory to add one.");
        return;
      }

      heading("Watched Directories");
      const rows = config.entries.map((entry) => {
        const exists = existsSync(entry.path);
        const status = exists ? chalk.green("ok") : chalk.red("missing");
        return [entry.path, chalk.cyan(entry.repoFullName), status];
      });
      table(rows, ["Path", "Repository", "Status"]);
      return;
    }

    const targetPath = resolve(pathArg ?? ".");

    if (opts.remove) {
      const config = loadWatchConfig();
      const before = config.entries.length;
      config.entries = config.entries.filter((e) => e.path !== targetPath);
      if (config.entries.length === before) {
        warn(`${targetPath} is not in the watch list.`);
        return;
      }
      saveWatchConfig(config);
      success(`Removed ${targetPath} from watch list.`);
      return;
    }

    // Add directory to watch list
    if (!existsSync(targetPath)) {
      error(`Directory not found: ${targetPath}`);
      process.exit(1);
    }

    const remoteUrl = getGitRemoteUrl(targetPath);
    if (!remoteUrl) {
      error(`No git remote found in ${targetPath}. Is this a git repository?`);
      process.exit(1);
    }

    const repoFullName = parseGitRemote(remoteUrl);
    if (!repoFullName) {
      error(`Could not parse git remote URL: ${remoteUrl}`);
      process.exit(1);
    }

    const config = loadWatchConfig();

    // Check for duplicates
    const existing = config.entries.find((e) => e.path === targetPath);
    if (existing) {
      if (existing.repoFullName === repoFullName) {
        info(`${targetPath} is already watched as ${chalk.cyan(repoFullName)}.`);
        return;
      }
      // Update remote if changed
      existing.remoteUrl = remoteUrl;
      existing.repoFullName = repoFullName;
      saveWatchConfig(config);
      success(`Updated ${targetPath} → ${chalk.cyan(repoFullName)} (via git remote)`);
      return;
    }

    config.entries.push({
      path: targetPath,
      remoteUrl,
      repoFullName,
      addedAt: new Date().toISOString(),
    });
    saveWatchConfig(config);
    success(`Added ${targetPath} → ${chalk.cyan(repoFullName)} (via git remote)`);

    if (opts.start !== false) {
      info("Starting agent...\n");
      // Detect if running as a compiled binary (Bun single-file executable)
      const isCompiledBinary = !process.execPath.includes("node") && !process.execPath.includes("bun") && existsSync(process.execPath);

      let execPath: string;
      let args: string[];

      if (isCompiledBinary) {
        execPath = process.execPath;
        args = ["agent", "start"];
      } else {
        const entryScript = process.argv[1];
        if (!entryScript || !existsSync(entryScript)) {
          const binPath = join(__dirname, "..", "..", "..", "bin", "octopus.js");
          if (!existsSync(binPath)) {
            error(`Could not locate agent binary at: ${binPath}`);
            process.exit(1);
          }
          execPath = process.execPath;
          args = [binPath, "agent", "start"];
        } else {
          execPath = process.execPath;
          args = [entryScript, "agent", "start"];
        }
      }
      if (opts.verbose) args.push("--verbose");

      const child = spawn(execPath, args, {
        stdio: "inherit",
      });
      await new Promise<void>((resolve) => {
        child.on("close", (code) => {
          process.exit(code ?? 0);
          resolve();
        });
      });
    }
  });
