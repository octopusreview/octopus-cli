import { Command } from "commander";
import { getApiUrl, setProfile } from "../lib/config-store.js";
import { error } from "../lib/output.js";
import { runDeviceFlow } from "../lib/device-flow.js";

export const setupTokenCommand = new Command("setup-token")
  .description(
    "Authenticate via browser and print the API token to stdout (for CI/CD setup)",
  )
  .option("--api-url <url>", "API base URL")
  .option("--no-open", "Don't open the browser automatically")
  .option("--save", "Also save the token to a local profile")
  .option("--profile <name>", "Profile name to save to (with --save)", "default")
  .action(async (opts) => {
    const apiUrl = opts.apiUrl ?? getApiUrl();

    try {
      const noOpen = opts.open === false;

      const result = await runDeviceFlow(apiUrl, {
        quiet: true,
        noOpen,
        onAuthorizeUrl: (url) => {
          process.stderr.write(
            noOpen
              ? `Open this URL in your browser to authorize:\n${url}\n`
              : `Opening browser to authorize: ${url}\n`,
          );
        },
      });

      if (opts.save) {
        setProfile(opts.profile, {
          apiUrl,
          token: result.token,
          orgSlug: result.organization.slug,
          orgId: result.organization.id,
        });
      }

      process.stdout.write(result.token + "\n");
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to obtain token");
      process.exit(1);
    }
  });
