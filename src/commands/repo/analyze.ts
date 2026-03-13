import { Command } from "commander";
import { resolveRepo } from "../../lib/repo-resolver.js";
import { apiPost, apiGet } from "../../lib/api-client.js";
import { error, success, info } from "../../lib/output.js";
import { createSpinner } from "../../lib/spinner.js";
import type { ApiRepo } from "../../types.js";

export const repoAnalyzeCommand = new Command("analyze")
  .argument("[repo]", "Repository name or full name (auto-detects from git remote)")
  .description("Run AI analysis on a repository")
  .action(async (repoArg?: string) => {
    try {
      const spinner = createSpinner("Resolving repository...").start();
      const repo = await resolveRepo(repoArg);
      spinner.text = `Starting analysis for ${repo.fullName}...`;

      await apiPost(`/api/cli/repos/${repo.id}/analyze`);
      spinner.text = `Analyzing ${repo.fullName}...`;

      // Poll for completion (max 10 minutes)
      let analysisStatus = "analyzing";
      let attempts = 0;
      const maxAttempts = 200;
      while (analysisStatus === "analyzing" && attempts < maxAttempts) {
        attempts++;
        await new Promise((r) => setTimeout(r, 3000));
        const { repo: updated } = await apiGet<{ repo: ApiRepo }>(
          `/api/cli/repos/${repo.id}/status`,
        );
        analysisStatus = updated.analysisStatus;

        if (analysisStatus === "done" || analysisStatus === "completed") {
          spinner.succeed(`Analysis complete for ${repo.fullName}`);
          if (updated.purpose) info(`Purpose: ${updated.purpose}`);
          if (updated.summary) info(`Summary: ${updated.summary}`);
          return;
        }

        if (analysisStatus === "failed") {
          spinner.fail(`Analysis failed for ${repo.fullName}`);
          process.exit(1);
        }
      }

      if (attempts >= maxAttempts) {
        spinner.fail(`Analysis timed out for ${repo.fullName} after ${maxAttempts * 3}s`);
        process.exit(1);
      }
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to analyze repository");
      process.exit(1);
    }
  });
