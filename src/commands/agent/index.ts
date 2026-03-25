import { Command } from "commander";
import { watchCommand } from "./watch.js";
import { startCommand } from "./start.js";

export const agentCommand = new Command("agent")
  .description("Local agent for real-time codebase search")
  .addCommand(watchCommand)
  .addCommand(startCommand);
