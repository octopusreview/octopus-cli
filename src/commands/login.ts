import { Command } from "commander";
import { setProfile, getApiUrl } from "../lib/config-store.js";
import { success, error, info } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";
import { runDeviceFlow } from "../lib/device-flow.js";

async function tokenFlow(
  token: string,
  apiUrl: string,
  profile: string,
): Promise<void> {
  const result = await withSpinner("Verifying token...", async () => {
    const res = await fetch(`${apiUrl}/api/cli/auth/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(body.error ?? "Invalid token");
    }

    return res.json() as Promise<{
      user: { id: string; name: string; email: string };
      organization: { id: string; name: string; slug: string };
    }>;
  });

  setProfile(profile, {
    apiUrl,
    token,
    orgSlug: result.organization.slug,
    orgId: result.organization.id,
  });

  success(
    `Logged in as ${result.user.name} (${result.user.email}) — org: ${result.organization.name}`,
  );
}

export const loginCommand = new Command("login")
  .description("Authenticate with Octopus (opens browser or use --token)")
  .option("--token <token>", "API token (oct_...) — skip browser auth")
  .option("--api-url <url>", "API base URL")
  .option("--profile <name>", "Profile name", "default")
  .action(async (opts) => {
    const apiUrl = opts.apiUrl ?? getApiUrl();

    try {
      if (opts.token) {
        if (!opts.token.startsWith("oct_")) {
          error("Invalid token format. Token must start with 'oct_'.");
          process.exit(1);
        }
        await tokenFlow(opts.token, apiUrl, opts.profile);
      } else {
        const result = await runDeviceFlow(apiUrl);

        setProfile(opts.profile, {
          apiUrl,
          token: result.token,
          orgSlug: result.organization.slug,
          orgId: result.organization.id,
        });

        const userEmail = result.user.email ? ` (${result.user.email})` : "";
        info("");
        success(
          `Logged in as ${result.user.name}${userEmail} — org: ${result.organization.name}`,
        );
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "Login failed");
      process.exit(1);
    }
  });
