import { Command } from "commander";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import chalk from "chalk";
import { success, error, info, warn, table } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";
import { getApiUrl } from "../lib/config-store.js";

const COMMANDS_DIR = join(process.cwd(), ".claude", "commands");
const STATE_DIR = join(homedir(), ".octopus");
const STATE_FILE = join(STATE_DIR, "skills-state.json");

// --- Types ---

interface SkillEntry {
  name: string;
  title: string;
  description: string;
  filename: string;
  hash: string;
}

interface SkillsManifest {
  version: number;
  skills: SkillEntry[];
}

interface InstalledSkillState {
  hash: string;
  installedAt: string;
}

interface SkillsState {
  lastKnownVersion: number;
  lastCheckedAt: string;
  installed: Record<string, InstalledSkillState>;
}

// --- State persistence ---

async function loadState(): Promise<SkillsState> {
  try {
    const data = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { lastKnownVersion: 0, lastCheckedAt: "", installed: {} };
  }
}

async function saveState(state: SkillsState): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// --- Helpers ---

function getBaseUrl(): string {
  return getApiUrl();
}

async function fetchSkillsManifest(): Promise<SkillsManifest> {
  const url = `${getBaseUrl()}/skills/skills.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch skills list: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<SkillsManifest>;
}

async function fetchSkillContent(filename: string): Promise<string> {
  const url = `${getBaseUrl()}/skills/${filename}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download skill file: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

function validateFilename(filename: string): string {
  const safe = basename(filename);
  if (!safe.endsWith(".md") || safe !== filename) {
    throw new Error(`Invalid skill filename: ${filename}`);
  }
  return safe;
}

// --- Commands ---

const listCommand = new Command("list")
  .description("List available Octopus skills and their install status")
  .action(async () => {
    let manifest: SkillsManifest;
    try {
      manifest = await withSpinner("Fetching skills…", () => fetchSkillsManifest());
    } catch (err: any) {
      error(err.message);
      return;
    }

    const state = await loadState();

    // New skills notification
    if (manifest.version > state.lastKnownVersion && state.lastKnownVersion > 0) {
      console.log(chalk.cyan("🆕 New skills available!\n"));
    }

    // Update state
    state.lastKnownVersion = manifest.version;
    state.lastCheckedAt = new Date().toISOString();
    await saveState(state);

    if (manifest.skills.length === 0) {
      info("No skills available.");
      return;
    }

    const rows: string[][] = [];
    for (const skill of manifest.skills) {
      const installedEntry = state.installed[skill.name];
      let status: string;

      if (installedEntry) {
        if (installedEntry.hash !== skill.hash) {
          status = chalk.green("✓ installed") + " " + chalk.yellow("(update available)");
        } else {
          status = chalk.green("✓ installed");
        }
      } else {
        status = chalk.dim("not installed");
      }

      rows.push([
        chalk.bold(skill.name),
        skill.description || chalk.dim("—"),
        status,
      ]);
    }

    table(rows, ["Name", "Description", "Status"]);
  });

const installCommand = new Command("install")
  .description("Install a skill from Octopus skill registry")
  .argument("[name]", "Skill name to install")
  .option("--all", "Install all available skills")
  .action(async (name: string | undefined, opts: { all?: boolean }) => {
    if (!name && !opts.all) {
      error("Provide a skill name or use --all to install all skills.");
      return;
    }

    let manifest: SkillsManifest;
    try {
      manifest = await withSpinner("Fetching skills…", () => fetchSkillsManifest());
    } catch (err: any) {
      error(err.message);
      return;
    }

    const toInstall = opts.all
      ? manifest.skills
      : manifest.skills.filter((s) => s.name === name);

    if (toInstall.length === 0) {
      error(`Skill "${name}" not found. Run ${chalk.cyan("octopus skills list")} to see available skills.`);
      return;
    }

    await mkdir(COMMANDS_DIR, { recursive: true });
    const state = await loadState();

    for (const skill of toInstall) {
      const installedEntry = state.installed[skill.name];

      // Already up to date
      if (installedEntry && installedEntry.hash === skill.hash) {
        info(`${chalk.bold(skill.name)} is already up to date.`);
        continue;
      }

      try {
        const safeFilename = validateFilename(skill.filename);
        const content = await withSpinner(
          `Downloading ${skill.name}…`,
          () => fetchSkillContent(safeFilename),
        );

        // Verify hash — abort on mismatch
        const downloadedHash = computeHash(content);
        if (downloadedHash !== skill.hash) {
          error(
            `Hash mismatch for ${chalk.bold(skill.name)}: expected ${skill.hash.slice(0, 12)}… got ${downloadedHash.slice(0, 12)}…. Aborting.`,
          );
          continue;
        }

        const dest = join(COMMANDS_DIR, safeFilename);
        await writeFile(dest, content, "utf-8");

        // Update state
        state.installed[skill.name] = {
          hash: skill.hash,
          installedAt: new Date().toISOString(),
        };

        if (installedEntry) {
          success(`Updated ${chalk.bold(skill.name)}.`);
        } else {
          success(
            `Installed ${chalk.bold(skill.name)}. Use it with: ${chalk.cyan(`/${skill.name}`)}`,
          );
        }
      } catch (err: any) {
        error(`Failed to install ${skill.name}: ${err.message}`);
      }
    }

    state.lastKnownVersion = manifest.version;
    state.lastCheckedAt = new Date().toISOString();
    await saveState(state);
  });

const updateCommand = new Command("update")
  .description("Update all installed skills to their latest versions")
  .action(async () => {
    let manifest: SkillsManifest;
    try {
      manifest = await withSpinner("Fetching skills…", () => fetchSkillsManifest());
    } catch (err: any) {
      error(err.message);
      return;
    }

    const state = await loadState();
    const installedNames = Object.keys(state.installed);

    if (installedNames.length === 0) {
      info("No skills installed. Run " + chalk.cyan("octopus skills install <name>") + " first.");
      return;
    }

    let updated = 0;
    let upToDate = 0;

    for (const name of installedNames) {
      const skill = manifest.skills.find((s) => s.name === name);
      if (!skill) {
        warn(`Skill "${name}" no longer exists in registry, skipping.`);
        continue;
      }

      if (state.installed[name].hash === skill.hash) {
        upToDate++;
        continue;
      }

      try {
        const safeFilename = validateFilename(skill.filename);
        const content = await withSpinner(
          `Updating ${skill.name}…`,
          () => fetchSkillContent(safeFilename),
        );

        const downloadedHash = computeHash(content);
        if (downloadedHash !== skill.hash) {
          error(
            `Hash mismatch for ${chalk.bold(skill.name)}: expected ${skill.hash.slice(0, 12)}… got ${downloadedHash.slice(0, 12)}…. Aborting.`,
          );
          continue;
        }

        await mkdir(COMMANDS_DIR, { recursive: true });
        await writeFile(join(COMMANDS_DIR, safeFilename), content, "utf-8");

        state.installed[name] = {
          hash: skill.hash,
          installedAt: new Date().toISOString(),
        };
        updated++;
      } catch (err: any) {
        error(`Failed to update ${name}: ${err.message}`);
      }
    }

    state.lastKnownVersion = manifest.version;
    state.lastCheckedAt = new Date().toISOString();
    await saveState(state);

    const parts: string[] = [];
    if (updated > 0) parts.push(`Updated ${updated} skill(s)`);
    if (upToDate > 0) parts.push(`${upToDate} already up to date`);
    success(parts.join(", ") || "Nothing to update.");
  });

const removeCommand = new Command("remove")
  .description("Remove an installed skill")
  .argument("<name>", "Skill name to remove")
  .action(async (name: string) => {
    const state = await loadState();

    if (!state.installed[name]) {
      error(`Skill "${name}" is not installed.`);
      return;
    }

    // Try to find filename from manifest, fallback to name-based convention
    let filename = `${name}.md`;
    try {
      const manifest = await fetchSkillsManifest();
      const skill = manifest.skills.find((s) => s.name === name);
      if (skill) filename = skill.filename;
    } catch {
      // Use fallback filename
    }

    const safeFilename = basename(filename);
    const dest = join(COMMANDS_DIR, safeFilename);
    try {
      await unlink(dest);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        error(`Failed to remove file: ${err.message}`);
        return;
      }
    }

    delete state.installed[name];
    await saveState(state);
    success(`Removed ${chalk.bold(name)}.`);
  });

// --- Startup check (exported for use in index.ts) ---

export async function checkSkillUpdates(): Promise<void> {
  try {
    const state = await loadState();

    // Throttle: max once per day
    if (state.lastCheckedAt) {
      const lastCheck = new Date(state.lastCheckedAt).getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (Date.now() - lastCheck < oneDayMs) return;
    }

    const url = `${getBaseUrl()}/skills/skills.json`;
    const res = await fetch(url);
    if (!res.ok) return;

    const manifest = (await res.json()) as SkillsManifest;

    // Update check timestamp
    state.lastCheckedAt = new Date().toISOString();

    // New version available
    if (manifest.version > state.lastKnownVersion && state.lastKnownVersion > 0) {
      console.log(
        chalk.cyan("🆕 New skills available!") +
          " Run " +
          chalk.cyan("`octopus skills list`") +
          " to see them.",
      );
    }

    // Check for hash changes in installed skills
    const installedNames = Object.keys(state.installed);
    if (installedNames.length > 0) {
      const hasUpdates = installedNames.some((name) => {
        const remote = manifest.skills.find((s) => s.name === name);
        return remote && state.installed[name].hash !== remote.hash;
      });

      if (hasUpdates) {
        console.log(
          chalk.yellow("📦 Skill updates available.") +
            " Run " +
            chalk.cyan("`octopus skills update`"),
        );
      }
    }

    state.lastKnownVersion = manifest.version;
    await saveState(state);
  } catch {
    // Silently ignore — startup check must never block or crash
  }
}

// --- Export command ---

export const skillsCommand = new Command("skills")
  .description("Manage Octopus skills for AI coding agents")
  .addCommand(listCommand)
  .addCommand(installCommand)
  .addCommand(updateCommand)
  .addCommand(removeCommand);
