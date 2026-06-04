import { Command } from "commander";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { success, error, info, warn } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";
import { getVersion } from "../lib/version.js";

const PKG_NAME = "@octp/cli";
const REGISTRY_URL = `https://registry.npmjs.org/${PKG_NAME}/latest`;

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Best-effort detection of the package manager the CLI was installed with,
 * inferred from this module's install path. Falls back to npm.
 */
function detectPackageManager(): PackageManager {
  const path = fileURLToPath(import.meta.url).toLowerCase();
  if (path.includes("pnpm")) return "pnpm";
  if (path.includes("yarn")) return "yarn";
  if (path.includes("bun")) return "bun";
  return "npm";
}

function globalInstallCommand(pm: PackageManager, spec: string): string {
  switch (pm) {
    case "pnpm":
      return `pnpm add -g ${spec}`;
    case "yarn":
      return `yarn global add ${spec}`;
    case "bun":
      return `bun add -g ${spec}`;
    default:
      return `npm install -g ${spec}`;
  }
}

/** Returns 1 if a > b, -1 if a < b, 0 if equal. */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

async function fetchLatestVersion(): Promise<string> {
  const res = await fetch(REGISTRY_URL);
  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status}`);
  }
  const data = (await res.json()) as { version?: string };
  if (!data.version) {
    throw new Error("Could not read latest version from npm registry");
  }
  return data.version;
}

export const updateCommand = new Command("update")
  .description("Update Octopus CLI to the latest version from npm")
  .option("--check", "Only check for updates without installing")
  .action(async (opts: { check?: boolean }): Promise<void> => {
    const current = getVersion();

    let latest: string;
    try {
      latest = await withSpinner("Checking npm for the latest version", () =>
        fetchLatestVersion(),
      );
    } catch (err) {
      error(`Update check failed: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }

    info(`Current version: ${current}`);
    info(`Latest version:  ${latest}`);

    if (compareSemver(latest, current) <= 0) {
      success("You're already on the latest version.");
      return;
    }

    const spec = `${PKG_NAME}@latest`;
    const installCmd = globalInstallCommand(detectPackageManager(), spec);

    if (opts.check) {
      warn(`A new version is available (${latest}). Run \`octopus update\` to install it.`);
      return;
    }

    try {
      await withSpinner(`Installing ${PKG_NAME}@${latest}`, async () => {
        execSync(installCmd, { stdio: "ignore" });
      });
    } catch (err) {
      error(`Update failed: ${(err as Error).message}`);
      info(`Try running manually: ${installCmd}`);
      process.exitCode = 1;
      return;
    }

    success(`Updated to ${latest}.`);
  });
