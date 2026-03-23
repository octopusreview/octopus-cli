import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { configCommand } from "./commands/config.js";
import { usageCommand } from "./commands/usage.js";
import { repoCommand } from "./commands/repo/index.js";
import { prCommand } from "./commands/pr/index.js";
import { knowledgeCommand } from "./commands/knowledge/index.js";
import { analyzeDepsCommand } from "./commands/analyze-deps.js";
import { skillsCommand } from "./commands/skills.js";

const program = new Command();

program
  .name("octopus")
  .description("Octopus CLI — AI-powered PR review and codebase intelligence")
  .version("0.1.0");

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(configCommand);
program.addCommand(usageCommand);
program.addCommand(repoCommand);
program.addCommand(prCommand);
program.addCommand(knowledgeCommand);
program.addCommand(analyzeDepsCommand);
program.addCommand(skillsCommand);

program.parse();
