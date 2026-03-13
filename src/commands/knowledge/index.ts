import { Command } from "commander";
import { knowledgeListCommand } from "./list.js";
import { knowledgeAddCommand } from "./add.js";
import { knowledgeRemoveCommand } from "./remove.js";

export const knowledgeCommand = new Command("knowledge")
  .description("Manage knowledge base documents");

knowledgeCommand.addCommand(knowledgeListCommand);
knowledgeCommand.addCommand(knowledgeAddCommand);
knowledgeCommand.addCommand(knowledgeRemoveCommand);
