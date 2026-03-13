import { Command } from "commander";
import { loadConfig, saveConfig } from "../lib/config-store.js";
import { success, error, heading, table } from "../lib/output.js";
import chalk from "chalk";

export const configCommand = new Command("config")
  .description("Manage CLI configuration");

configCommand
  .command("list")
  .description("List all profiles")
  .action(() => {
    const config = loadConfig();
    const profiles = Object.entries(config.profiles);

    if (profiles.length === 0) {
      console.log("No profiles configured. Run 'octopus login' to get started.");
      return;
    }

    heading("Profiles");
    const rows = profiles.map(([name, p]) => [
      name === config.activeProfile ? chalk.green(`* ${name}`) : `  ${name}`,
      p.orgSlug,
      p.apiUrl,
      p.token.slice(0, 8) + "...",
    ]);
    table(rows, ["Profile", "Org", "API URL", "Token"]);
    console.log();
  });

configCommand
  .command("set <key> <value>")
  .description("Set a config value (apiUrl, activeProfile)")
  .action((key, value) => {
    const config = loadConfig();

    if (key === "activeProfile") {
      if (!config.profiles[value]) {
        error(`Profile "${value}" not found.`);
        process.exit(1);
      }
      config.activeProfile = value;
      saveConfig(config);
      success(`Active profile set to "${value}".`);
    } else if (key === "apiUrl") {
      try {
        new URL(value);
      } catch {
        error(`Invalid URL format: ${value}`);
        process.exit(1);
      }
      const profile = config.profiles[config.activeProfile];
      if (!profile) {
        error("No active profile. Run 'octopus login' first.");
        process.exit(1);
      }
      profile.apiUrl = value;
      saveConfig(config);
      success(`API URL set to "${value}".`);
    } else {
      error(`Unknown config key: ${key}. Valid keys: apiUrl, activeProfile`);
      process.exit(1);
    }
  });

configCommand
  .command("get <key>")
  .description("Get a config value")
  .action((key) => {
    const config = loadConfig();
    const profile = config.profiles[config.activeProfile];

    if (key === "activeProfile") {
      console.log(config.activeProfile);
    } else if (key === "apiUrl") {
      console.log(profile?.apiUrl ?? "not set");
    } else if (key === "orgSlug") {
      console.log(profile?.orgSlug ?? "not set");
    } else if (key === "orgId") {
      console.log(profile?.orgId ?? "not set");
    } else {
      error(`Unknown config key: ${key}`);
      process.exit(1);
    }
  });
