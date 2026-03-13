import { Command } from "commander";
import { repoListCommand } from "./list.js";
import { repoStatusCommand } from "./status.js";
import { repoIndexCommand } from "./index-cmd.js";
import { repoAnalyzeCommand } from "./analyze.js";
import { repoChatCommand } from "./chat.js";

export const repoCommand = new Command("repo")
  .description("Manage repositories");

repoCommand.addCommand(repoListCommand);
repoCommand.addCommand(repoStatusCommand);
repoCommand.addCommand(repoIndexCommand);
repoCommand.addCommand(repoAnalyzeCommand);
repoCommand.addCommand(repoChatCommand);
