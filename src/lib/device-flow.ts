import { exec } from "node:child_process";
import chalk from "chalk";
import { info } from "./output.js";

const MAX_POLL_ATTEMPTS = 200;
const POLL_INTERVAL_MS = 2000;

export interface DeviceFlowResult {
  token: string;
  organization: { id: string; slug: string; name: string };
  user: { name: string; email: string };
}

export interface DeviceFlowOptions {
  /** Suppress all stdout output (for raw / scripting use). */
  quiet?: boolean;
  /** Skip opening the browser automatically. */
  noOpen?: boolean;
  /** Called with the authorization URL once obtained (e.g. to print to stderr). */
  onAuthorizeUrl?: (url: string) => void;
}

function openBrowser(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new Error("Invalid authorization URL");
  }

  if (process.platform === "win32") {
    exec(`start "" "${url}"`);
  } else {
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    exec(`${cmd} "${url}"`);
  }
}

export async function runDeviceFlow(
  apiUrl: string,
  options: DeviceFlowOptions = {},
): Promise<DeviceFlowResult> {
  const { quiet = false, noOpen = false, onAuthorizeUrl } = options;
  const log = quiet ? () => {} : info;

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

  const authorizeUrl = `${apiUrl}/cli/authorize?code=${deviceCode}`;

  onAuthorizeUrl?.(authorizeUrl);

  log("");
  log(noOpen ? "Open the following URL in your browser to authorize:" : "Opening browser to authorize...");
  log(chalk.dim(authorizeUrl));
  log("");

  if (!noOpen) {
    openBrowser(authorizeUrl);
  }

  log("Waiting for authorization (press Ctrl+C to cancel)...");

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
        throw new Error(
          `Network error during authorization: ${networkError instanceof Error ? networkError.message : String(networkError)}`,
        );
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
      return {
        token: data.token,
        organization: data.organization,
        user: {
          name: data.user?.name ?? "Unknown User",
          email: data.user?.email ?? "",
        },
      };
    }
  }

  throw new Error("Authorization timed out after too many attempts.");
}
