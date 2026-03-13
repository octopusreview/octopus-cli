import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolveRepo } from "../../lib/repo-resolver.js";
import { apiStream } from "../../lib/api-client.js";
import { error, info } from "../../lib/output.js";
import { withSpinner } from "../../lib/spinner.js";
import chalk from "chalk";

export const repoChatCommand = new Command("chat")
  .argument("[repo]", "Repository name or full name (auto-detects from git remote)")
  .description("Start an interactive chat about a repository")
  .action(async (repoArg?: string) => {
    try {
      const repo = await withSpinner("Resolving repository...", async () => {
        return resolveRepo(repoArg);
      });

      info(`Chatting about ${chalk.bold(repo.fullName)}. Type 'exit' or Ctrl+C to quit.\n`);

      const rl = createInterface({ input: stdin, output: stdout });
      let conversationId: string | null = null;
      let isClosed = false;

      rl.on("close", () => { isClosed = true; });

      const promptUser = async () => {
        try {
          if (isClosed) return;
          const message = await rl.question(chalk.cyan("you> "));

          if (!message.trim()) {
            await promptUser();
            return;
          }

          if (message.trim().toLowerCase() === "exit") {
            rl.close();
            return;
          }

          process.stdout.write(chalk.green("octopus> "));

          await apiStream(
            "/api/cli/chat",
            {
              message,
              conversationId,
              repoId: repo.id,
            },
            (data) => {
              if (data.type === "conversation_id") {
                conversationId = data.id as string;
              } else if (data.type === "delta") {
                process.stdout.write(data.text as string);
              } else if (data.type === "error") {
                process.stdout.write(chalk.red(`\nError: ${data.message}`));
              }
            },
          );

          process.stdout.write("\n\n");
          await promptUser();
        } catch (err) {
          if (isClosed || (err as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") return;
          throw err;
        }
      };

      await promptUser();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Chat failed");
      process.exit(1);
    }
  });
