import { Command } from "commander";
import { apiGet } from "../../lib/api-client.js";
import { error, table, statusBadge, formatDate } from "../../lib/output.js";
import { withSpinner } from "../../lib/spinner.js";
import type { ApiRepo } from "../../types.js";

export const repoListCommand = new Command("list")
  .description("List all repositories")
  .action(async () => {
    try {
      const { repos } = await withSpinner("Fetching repositories...", async () => {
        return apiGet<{ repos: ApiRepo[] }>("/api/cli/repos");
      });

      if (repos.length === 0) {
        console.log("No repositories found. Connect repos in the Octopus dashboard.");
        return;
      }

      const rows = repos.map((r) => [
        r.fullName,
        r.provider,
        statusBadge(r.indexStatus),
        statusBadge(r.analysisStatus),
        String(r._count.pullRequests),
        formatDate(r.indexedAt),
      ]);

      table(rows, ["Repository", "Provider", "Index", "Analysis", "PRs", "Last Indexed"]);
      console.log(`\n${repos.length} repositories total`);
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to list repos");
      process.exit(1);
    }
  });
