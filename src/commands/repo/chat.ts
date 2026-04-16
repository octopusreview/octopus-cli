import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolveRepo } from "../../lib/repo-resolver.js";
import { apiStream } from "../../lib/api-client.js";
import { error, info } from "../../lib/output.js";
import { withSpinner } from "../../lib/spinner.js";
import chalk from "chalk";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

export const repoChatCommand = new Command("chat")
  .argument("[repo]", "Repository name or full name (auto-detects from git remote)")
  .option("-p, --print <message>", "Pipeline mode: ask a single question and print the answer (no interactive UI)")
  .option("-g, --global", "Global mode: ask questions across all repos in your organization")
  .description("Start an interactive chat about a repository")
  .action(async (repoArg: string | undefined, opts: { print?: string; global?: boolean }) => {
    try {
      const isPipeline = opts.print !== undefined || !stdin.isTTY;
      const isGlobal = opts.global === true;

      let repoId: string | null = null;
      let label: string;

      if (isGlobal) {
        label = "your organization";
      } else {
        const repo = isPipeline
          ? await resolveRepo(repoArg)
          : await withSpinner("Resolving repository...", async () => {
              return resolveRepo(repoArg);
            });
        repoId = repo.id;
        label = repo.fullName;
      }

      // Pipeline mode: single question → answer → exit
      if (isPipeline) {
        const message = opts.print || await readStdin();
        if (!message) {
          process.stderr.write("Error: no message provided. Use -p <message> or pipe via stdin.\n");
          process.exit(1);
        }

        let hasError = false;
        await apiStream(
          "/api/cli/chat",
          { message, conversationId: null, repoId },
          (data) => {
            if (data.type === "delta") {
              process.stdout.write(data.text as string);
            } else if (data.type === "error") {
              process.stderr.write(`Error: ${data.message}\n`);
              hasError = true;
            }
          },
        );

        process.stdout.write("\n");
        if (hasError) process.exit(1);
        return;
      }

      // Interactive mode
      info(`Chatting about ${chalk.bold(label)}. Type 'exit' or Ctrl+C to quit.\n`);

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
              repoId,
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
