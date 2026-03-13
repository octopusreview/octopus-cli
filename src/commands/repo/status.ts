import { Command } from "commander";
import { resolveRepo } from "../../lib/repo-resolver.js";
import { error, heading, statusBadge, formatDate, formatDuration, formatNumber } from "../../lib/output.js";
import { withSpinner } from "../../lib/spinner.js";
import { apiGet } from "../../lib/api-client.js";
import type { ApiRepo } from "../../types.js";

export const repoStatusCommand = new Command("status")
  .argument("[repo]", "Repository name or full name (auto-detects from git remote)")
  .description("Show repository status and details")
  .action(async (repoArg?: string) => {
    try {
      const repo = await withSpinner("Resolving repository...", async () => {
        const resolved = await resolveRepo(repoArg);
        // Fetch full status
        const { repo: full } = await apiGet<{ repo: ApiRepo }>(
          `/api/cli/repos/${resolved.id}/status`,
        );
        return full;
      });

      heading(repo.fullName);
      console.log(`  Provider:       ${repo.provider}`);
      console.log(`  Default Branch: ${repo.defaultBranch}`);
      console.log(`  Auto Review:    ${repo.autoReview ? "enabled" : "disabled"}`);

      heading("Indexing");
      console.log(`  Status:     ${statusBadge(repo.indexStatus)}`);
      console.log(`  Last Index: ${formatDate(repo.indexedAt)}`);
      console.log(`  Files:      ${repo.indexedFiles}/${repo.totalFiles}`);
      console.log(`  Chunks:     ${formatNumber(repo.totalChunks)}`);
      console.log(`  Vectors:    ${formatNumber(repo.totalVectors ?? 0)}`);
      console.log(`  Duration:   ${formatDuration(repo.indexDurationMs)}`);

      heading("Analysis");
      console.log(`  Status:      ${statusBadge(repo.analysisStatus)}`);
      console.log(`  Last Analyzed: ${formatDate(repo.analyzedAt)}`);
      if (repo.purpose) console.log(`  Purpose:     ${repo.purpose}`);
      if (repo.summary) console.log(`  Summary:     ${repo.summary}`);

      heading("Stats");
      console.log(`  Pull Requests: ${repo._count.pullRequests}`);
      console.log(`  Contributors:  ${repo.contributorCount ?? 0}`);
      console.log();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to get repo status");
      process.exit(1);
    }
  });
