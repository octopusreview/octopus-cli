import { Command } from "commander";
import { resolveRepo } from "../../lib/repo-resolver.js";
import { apiPost, apiGet } from "../../lib/api-client.js";
import { error, success, info, formatNumber, formatDuration } from "../../lib/output.js";
import { createSpinner } from "../../lib/spinner.js";
import type { ApiRepo } from "../../types.js";

export const repoIndexCommand = new Command("index")
  .argument("[repo]", "Repository name or full name (auto-detects from git remote)")
  .description("Index a repository for code search")
  .action(async (repoArg?: string) => {
    try {
      const spinner = createSpinner("Resolving repository...").start();
      const repo = await resolveRepo(repoArg);
      spinner.text = `Starting index for ${repo.fullName}...`;

      await apiPost(`/api/cli/repos/${repo.id}/index`);
      spinner.text = `Indexing ${repo.fullName}...`;

      // Poll for completion (max 10 minutes)
      let status = "indexing";
      let attempts = 0;
      const maxAttempts = 200;
      while (status === "indexing" && attempts < maxAttempts) {
        attempts++;
        await new Promise((r) => setTimeout(r, 3000));
        const { repo: updated } = await apiGet<{ repo: ApiRepo }>(
          `/api/cli/repos/${repo.id}/status`,
        );
        status = updated.indexStatus;

        if (status === "indexed") {
          spinner.succeed(`Indexed ${repo.fullName}`);
          info(`Files: ${updated.indexedFiles}/${updated.totalFiles}`);
          info(`Chunks: ${formatNumber(updated.totalChunks)}`);
          info(`Duration: ${formatDuration(updated.indexDurationMs)}`);
          return;
        }

        if (status === "failed") {
          spinner.fail(`Indexing failed for ${repo.fullName}`);
          process.exit(1);
        }
      }

      if (attempts >= maxAttempts) {
        spinner.fail(`Indexing timed out for ${repo.fullName} after ${maxAttempts * 3}s`);
        process.exit(1);
      }
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to index repository");
      process.exit(1);
    }
  });
