import { Command } from "commander";
import { apiGet } from "../lib/api-client.js";
import { success, error, heading } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";

export const whoamiCommand = new Command("whoami")
  .description("Show current user and organization info")
  .action(async () => {
    try {
      const data = await withSpinner("Fetching account info...", async () => {
        return apiGet<{
          user: { id: string; name: string; email: string };
          organization: {
            id: string;
            name: string;
            slug: string;
            memberCount: number;
            repoCount: number;
          };
        }>("/api/cli/me");
      });

      heading("Account");
      console.log(`  Name:  ${data.user.name}`);
      console.log(`  Email: ${data.user.email}`);

      heading("Organization");
      console.log(`  Name:    ${data.organization.name}`);
      console.log(`  Slug:    ${data.organization.slug}`);
      console.log(`  Members: ${data.organization.memberCount}`);
      console.log(`  Repos:   ${data.organization.repoCount}`);
      console.log();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to fetch account info");
      process.exit(1);
    }
  });
