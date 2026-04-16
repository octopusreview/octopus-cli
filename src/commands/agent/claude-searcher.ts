import { spawnSync, execFileSync } from "node:child_process";

const MAX_SUMMARY_SIZE = 15 * 1024; // 15KB

/**
 * Check if the Claude CLI is available.
 */
export function hasClaudeCli(): boolean {
  try {
    execFileSync("claude", ["--version"], {
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
    const result = spawnSync("claude", ["-p", prompt], {
      cwd: repoDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 2 * 1024 * 1024, // 2MB
      timeout: timeoutMs,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(result.stderr?.slice(0, 500) ?? "Non-zero exit code");
    }

    const summary = (result.stdout ?? "").trim();
    return summary.length > MAX_SUMMARY_SIZE
      ? summary.slice(0, MAX_SUMMARY_SIZE)
      : summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Claude CLI search failed: ${message}`);
  }
}

const MAX_ANSWER_SIZE = 100 * 1024; // 100KB

interface AnswerTaskParams {
  systemPrompt: string;
  contextSections: string;
  conversationHistory: { role: string; content: string }[];
}

/**
 * Generate a full answer using Claude CLI with Qdrant context + local codebase.
 * The prompt is piped via stdin to avoid shell argument length limits.
 */
export async function claudeAnswer(
  task: { query: string; params: Record<string, unknown> },
  repoDir: string,
  timeoutMs = 115_000,
): Promise<string> {
  const { systemPrompt, contextSections, conversationHistory } = task.params as unknown as AnswerTaskParams;

  const augmentedSystemPrompt = `${systemPrompt}

IMPORTANT: You have access to BOTH the retrieved context sections below AND the actual local codebase in your working directory. The context sections come from an indexed knowledge base which may be stale. You are running in the actual repo directory — use your tools to read files, search code, and verify information against the real current state. If you find discrepancies between the indexed context and actual files, prefer the actual files and note the difference.`;

  const historyText = conversationHistory
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const fullPrompt = `${augmentedSystemPrompt}

---
${contextSections}
---

Conversation:
${historyText}`;

  const result = spawnSync("claude", ["-p", "--max-tokens", "4096"], {
    input: fullPrompt,
    cwd: repoDir,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
    timeout: timeoutMs,
  });

  if (result.error) {
    throw new Error(`Claude CLI answer failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.slice(0, 500) ?? "";
    throw new Error(`Claude CLI exited with code ${result.status}: ${stderr}`);
  }

  const answer = (result.stdout ?? "").trim();
  return answer.length > MAX_ANSWER_SIZE ? answer.slice(0, MAX_ANSWER_SIZE) : answer;
}
