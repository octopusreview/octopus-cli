import { Command } from "commander";
import { apiDelete } from "../../lib/api-client.js";
import { error, success } from "../../lib/output.js";
import { withSpinner } from "../../lib/spinner.js";

export const knowledgeRemoveCommand = new Command("remove")
  .argument("<id>", "Document ID to remove")
  .description("Remove a knowledge document (soft delete)")
  .action(async (id: string) => {
    try {
      await withSpinner("Removing document...", async () => {
        return apiDelete(`/api/cli/knowledge/${id}`);
      });

      success(`Document ${id} removed.`);
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to remove document");
      process.exit(1);
    }
  });
