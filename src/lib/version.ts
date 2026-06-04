import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Reads the CLI version from the package.json shipped with the install.
 * Single source of truth — used by both the program version flag and the
 * `update` command so the path resolution can never diverge.
 */
export function getVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(here, "..", "..", "package.json"), "utf-8"),
    );
    return pkg.version ?? "0.0.0";
  } catch {
    // fall back to placeholder; CLI remains functional
    return "0.0.0";
  }
}
