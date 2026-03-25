import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
import { agentCommand } from "./commands/agent/index.js";

let version = "0.0.0";
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
  version = pkg.version ?? version;
} catch {
  // fall back to placeholder; CLI remains functional
}

const program = new Command();

program
  .name("octopus")
  .description("Octopus CLI — AI-powered PR review and codebase intelligence")
  .version(version);

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
program.addCommand(agentCommand);

program.parse();
