import { Command } from "commander";
import { apiGet } from "../../lib/api-client.js";
import { error, table, statusBadge, formatDate } from "../../lib/output.js";
import { withSpinner } from "../../lib/spinner.js";
import type { KnowledgeDocument } from "../../types.js";

export const knowledgeListCommand = new Command("list")
  .description("List knowledge base documents")
  .action(async () => {
    try {
      const { documents } = await withSpinner("Fetching documents...", async () => {
        return apiGet<{ documents: KnowledgeDocument[] }>("/api/cli/knowledge");
      });

      if (documents.length === 0) {
        console.log("No knowledge documents found. Use 'octopus knowledge add' to add one.");
        return;
      }

      const rows = documents.map((d) => [
        d.id.slice(0, 8),
        d.title,
        d.sourceType,
        statusBadge(d.status),
        String(d.totalChunks),
        formatDate(d.createdAt),
      ]);

      table(rows, ["ID", "Title", "Type", "Status", "Chunks", "Created"]);
      console.log(`\n${documents.length} documents total`);
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to list documents");
      process.exit(1);
    }
  });
