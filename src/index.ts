import { Command } from "commander";
import { getVersion } from "./lib/version.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { setupTokenCommand } from "./commands/setup-token.js";
import { whoamiCommand } from "./commands/whoami.js";
import { configCommand } from "./commands/config.js";
import { usageCommand } from "./commands/usage.js";
import { repoCommand } from "./commands/repo/index.js";
import { prCommand } from "./commands/pr/index.js";
import { reviewAction, PR_ARG_DESC } from "./commands/pr/review.js";
import { knowledgeCommand } from "./commands/knowledge/index.js";
import { analyzeDepsCommand } from "./commands/analyze-deps.js";
import { skillsCommand, checkSkillUpdates } from "./commands/skills.js";
import { agentCommand } from "./commands/agent/index.js";
import { updateCommand } from "./commands/update.js";

const version = getVersion();

const program = new Command();

program
  .name("octopus")
  .description("Octopus CLI — AI-powered PR review and codebase intelligence")
  .version(version);

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(setupTokenCommand);
program.addCommand(whoamiCommand);
program.addCommand(configCommand);
program.addCommand(usageCommand);
program.addCommand(repoCommand);
program.addCommand(prCommand);
program.addCommand(knowledgeCommand);
program.addCommand(analyzeDepsCommand);
program.addCommand(skillsCommand);
program.addCommand(agentCommand);
program.addCommand(updateCommand);

// Top-level alias: `octopus review` → `octopus pr review`
program
  .command("review")
  .argument("[pr]", PR_ARG_DESC)
  .option("--pr <pr>", PR_ARG_DESC)
  .description("Trigger an AI review on a pull request (alias for 'pr review')")
  .action(reviewAction);

// Non-blocking startup check for skill updates
checkSkillUpdates();

program.parse();
