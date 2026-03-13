import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { spawn } from "node:child_process";
import { setProfile, getApiUrl } from "../lib/config-store.js";
import { success, error, info } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";
import chalk from "chalk";

const MAX_POLL_ATTEMPTS = 200;
const POLL_INTERVAL_MS = 2000;

function openBrowser(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new Error("Invalid authorization URL");
  }

  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else {
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
  }
}

async function deviceFlow(apiUrl: string, profile: string): Promise<void> {
  // Step 1: Request a device code
  const deviceRes = await fetch(`${apiUrl}/api/cli/auth/device`, {
    method: "POST",
  });

  if (!deviceRes.ok) {
    if (deviceRes.status === 404) {
      throw new Error("Device authorization endpoint not found. Is the server up to date?");
    }
    if (deviceRes.status === 429) {
      throw new Error("Too many login attempts. Please wait a minute and try again.");
    }
    throw new Error(`Failed to initiate login (HTTP ${deviceRes.status}). Is the server running?`);
  }

  const deviceData = (await deviceRes.json()) as Record<string, unknown>;
  const deviceCode = deviceData.deviceCode;
  const expiresAt = deviceData.expiresAt;
  if (typeof deviceCode !== "string" || typeof expiresAt !== "string") {
    throw new Error("Invalid response from device authorization endpoint");
  }

  // Step 2: Open browser
  const authorizeUrl = `${apiUrl}/cli/authorize?code=${deviceCode}`;

  info("");
  info("Opening browser to authorize...");
  info(chalk.dim(authorizeUrl));
  info("");

  openBrowser(authorizeUrl);

  info("Waiting for authorization (press Ctrl+C to cancel)...");

  // Step 3: Poll for token
  const expiry = new Date(expiresAt).getTime();
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    if (Date.now() > expiry) {
      throw new Error("Authorization timed out. Please try again.");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    attempts++;

    let pollRes: Response;
    try {
      pollRes = await fetch(
        `${apiUrl}/api/cli/auth/poll?device_code=${deviceCode}`,
      );
    } catch (networkError) {
      if (attempts > 5) {
        throw new Error(`Network error during authorization: ${networkError instanceof Error ? networkError.message : String(networkError)}`);
      }
      continue;
    }

    if (pollRes.status === 410) {
      throw new Error("Authorization expired. Please try again.");
    }

    if (!pollRes.ok && pollRes.status !== 200) {
      continue;
    }

    const data = (await pollRes.json()) as {
      status: string;
      token?: string;
      organization?: { id: string; slug: string; name: string };
      user?: { name: string; email: string };
    };

    if (data.status === "approved" && data.token && data.organization) {
      setProfile(profile, {
        apiUrl,
        token: data.token,
        orgSlug: data.organization.slug,
        orgId: data.organization.id,
      });

      const userName = data.user?.name || "Unknown User";
      const userEmail = data.user?.email ? ` (${data.user.email})` : "";
      info("");
      success(
        `Logged in as ${userName}${userEmail} — org: ${data.organization.name}`,
      );
      return;
    }
  }

  throw new Error("Authorization timed out after too many attempts.");
}

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
        // Direct token flow
        if (!opts.token.startsWith("oct_")) {
          error("Invalid token format. Token must start with 'oct_'.");
          process.exit(1);
        }
        await tokenFlow(opts.token, apiUrl, opts.profile);
      } else {
        // Device authorization flow (browser-based)
        await deviceFlow(apiUrl, opts.profile);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "Login failed");
      process.exit(1);
    }
  });
