import { Command } from "commander";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { success, error, info } from "../../lib/output.js";

const pidFile = join(homedir(), ".octopus", "agent.pid");

export const stopCommand = new Command("stop")
  .description("Stop the local agent daemon")
  .action(() => {
    if (!existsSync(pidFile)) {
      info("No running agent found.");
      return;
    }

    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    if (isNaN(pid)) {
      error("Invalid PID file. Removing it.");
      unlinkSync(pidFile);
      return;
    }

    try {
      process.kill(pid, "SIGTERM");
      success(`Agent stopped (PID: ${pid}).`);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        info("Agent process was not running.");
      } else {
        error(`Failed to stop agent: ${err instanceof Error ? err.message : err}`);
      }
    }

    try {
      unlinkSync(pidFile);
    } catch {}
  });
