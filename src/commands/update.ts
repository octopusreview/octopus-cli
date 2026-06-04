import { Command } from "commander";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { success, error, info, warn } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";

const PKG_NAME = "@octp/cli";
const REGISTRY_URL = `https://registry.npmjs.org/${PKG_NAME}/latest`;

function getCurrentVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"),
    );
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
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
  .action(async (opts) => {
    const current = getCurrentVersion();

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

    if (opts.check) {
      warn(
        `A new version is available (${latest}). Run \`octopus update\` to install it.`,
      );
      return;
    }

    try {
      await withSpinner(`Installing ${PKG_NAME}@${latest}`, async () => {
        execSync(`npm install -g ${PKG_NAME}@latest`, { stdio: "ignore" });
      });
    } catch (err) {
      error(`Update failed: ${(err as Error).message}`);
      info(`Try running manually: npm install -g ${PKG_NAME}@latest`);
      process.exitCode = 1;
      return;
    }

    success(`Updated to ${latest}.`);
  });
