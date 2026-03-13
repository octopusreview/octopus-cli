import { Command } from "commander";
import { prReviewCommand } from "./review.js";

export const prCommand = new Command("pr")
  .description("Pull request operations");

prCommand.addCommand(prReviewCommand);
