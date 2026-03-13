import { execSync } from "node:child_process";
import { apiGet } from "./api-client.js";
import type { ApiRepo } from "../types.js";

/**
 * Extract repo full name from git remote URL.
 * Supports both SSH and HTTPS formats:
 * - git@github.com:owner/repo.git
 * - https://github.com/owner/repo.git
 * - git@bitbucket.org:owner/repo.git
 */
function parseGitRemote(url: string): string | null {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/https?:\/\/[^/]+\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];

  return null;
}

function getGitRemoteUrl(): string | null {
  try {
    return execSync("git remote get-url origin", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Resolve a repo argument to an API repo.
 * - If repoArg is provided, search by name/fullName
 * - If not provided, detect from CWD git remote
 */
export async function resolveRepo(repoArg?: string): Promise<ApiRepo> {
  const { repos } = await apiGet<{ repos: ApiRepo[] }>("/api/cli/repos");

  if (repoArg) {
    const match = repos.find(
      (r) =>
        r.fullName === repoArg ||
        r.name === repoArg ||
        r.fullName.toLowerCase() === repoArg.toLowerCase() ||
        r.name.toLowerCase() === repoArg.toLowerCase(),
    );
    if (!match) {
      throw new Error(`Repository "${repoArg}" not found. Run 'octopus repo list' to see available repos.`);
    }
    return match;
  }

  // Try to detect from CWD
  const remoteUrl = getGitRemoteUrl();
  if (!remoteUrl) {
    throw new Error("Not in a git repository. Provide a repo name or run from a git directory.");
  }

  const fullName = parseGitRemote(remoteUrl);
  if (!fullName) {
    throw new Error(`Could not parse git remote URL: ${remoteUrl}`);
  }

  const match = repos.find(
    (r) => r.fullName.toLowerCase() === fullName.toLowerCase(),
  );
  if (!match) {
    throw new Error(
      `Repository "${fullName}" is not connected to your Octopus organization. Run 'octopus repo list' to see available repos.`,
    );
  }

  return match;
}
