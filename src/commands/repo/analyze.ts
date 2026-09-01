import { Command } from "commander";
import { resolveRepo } from "../../lib/repo-resolver.js";
import { apiPost, apiGet } from "../../lib/api-client.js";
import { error, success, info } from "../../lib/output.js";
import { createSpinner } from "../../lib/spinner.js";
import { analysisOutcome } from "../../lib/analysis-status.js";
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
      while (analysisOutcome(analysisStatus) === "pending" && attempts < maxAttempts) {
        attempts++;
        await new Promise((r) => setTimeout(r, 3000));
        const { repo: updated } = await apiGet<{ repo: ApiRepo }>(
          `/api/cli/repos/${repo.id}/status`,
        );
        analysisStatus = updated.analysisStatus;
        const outcome = analysisOutcome(analysisStatus);

        if (outcome === "success") {
          spinner.succeed(`Analysis complete for ${repo.fullName}`);
          const preview = (updated.analysis ?? "")
            .split("\n")
            .filter((line) => line.trim() !== "")
            .slice(0, 12);
          if (preview.length > 0) {
            for (const line of preview) info(line);
          } else {
            if (updated.purpose) info(`Purpose: ${updated.purpose}`);
            if (updated.summary) info(`Summary: ${updated.summary}`);
          }
          return;
        }

        if (outcome === "failed") {
          spinner.fail(`Analysis failed for ${repo.fullName}`);
          process.exit(1);
        }

        if (outcome === "unexpected") {
          spinner.fail(`Unexpected analysis status: ${analysisStatus}`);
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
