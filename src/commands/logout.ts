import { Command } from "commander";
import { removeProfile, loadConfig } from "../lib/config-store.js";
import { success, warn } from "../lib/output.js";

export const logoutCommand = new Command("logout")
  .description("Remove saved credentials")
  .option("--profile <name>", "Profile to remove", "default")
  .action((opts) => {
    const config = loadConfig();
    if (!config.profiles[opts.profile]) {
      warn(`Profile "${opts.profile}" not found.`);
      return;
    }

    removeProfile(opts.profile);
    success(`Logged out from profile "${opts.profile}".`);
  });
