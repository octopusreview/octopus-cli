import { execSync } from "node:child_process";

const MAX_SUMMARY_SIZE = 15 * 1024; // 15KB

/**
 * Check if the Claude CLI is available.
 */
export function hasClaudeCli(): boolean {
  try {
    execSync("claude --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a search query using Claude CLI.
 * Shells out to `claude -p` in the repo directory.
 */
export async function claudeSearch(
  query: string,
  repoDir: string,
  timeoutMs = 25_000,
): Promise<string> {
  const prompt = `Search this codebase for information relevant to the following question. Return the most relevant code snippets with file paths and line numbers. Be concise and focus on the most important findings.\n\nQuestion: ${query}`;

  try {
    const result = execSync(
      `claude -p ${JSON.stringify(prompt)}`,
      {
        cwd: repoDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 2 * 1024 * 1024, // 2MB
        timeout: timeoutMs,
      },
    );

    const summary = result.trim();
    return summary.length > MAX_SUMMARY_SIZE
      ? summary.slice(0, MAX_SUMMARY_SIZE)
      : summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Claude CLI search failed: ${message}`);
  }
}
