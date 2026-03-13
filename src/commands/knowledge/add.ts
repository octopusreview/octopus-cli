import { Command } from "commander";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { apiPost } from "../../lib/api-client.js";
import { error, success } from "../../lib/output.js";
import { withSpinner } from "../../lib/spinner.js";

export const knowledgeAddCommand = new Command("add")
  .argument("<file>", "File path to add as knowledge document")
  .option("--title <title>", "Document title (defaults to filename)")
  .description("Add a file to the knowledge base")
  .action(async (filePath: string, opts: { title?: string }) => {
    try {
      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        error(`Could not read file: ${filePath}`);
        process.exit(1);
      }

      const fileName = basename(filePath);
      const title = opts.title ?? fileName;

      const result = await withSpinner(`Uploading ${fileName}...`, async () => {
        return apiPost<{ document: { id: string; title: string } }>(
          "/api/cli/knowledge",
          { title, content, fileName },
        );
      });

      success(`Added "${result.document.title}" (${result.document.id})`);
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to add document");
      process.exit(1);
    }
  });
