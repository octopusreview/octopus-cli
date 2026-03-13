import { Command } from "commander";
import { apiGet } from "../lib/api-client.js";
import { error, heading, table, formatNumber, formatUsd } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";
import chalk from "chalk";
import type { UsageBreakdown } from "../types.js";

export const usageCommand = new Command("usage")
  .description("Show monthly usage and credit balance")
  .action(async () => {
    try {
      const data = await withSpinner("Fetching usage data...", async () => {
        return apiGet<{
          period: { start: string; end: string };
          totalSpend: number;
          spendLimit: number | null;
          creditBalance: number;
          freeCreditBalance: number;
          breakdown: UsageBreakdown[];
        }>("/api/cli/usage");
      });

      heading("Monthly Usage");
      console.log(`  Period:        ${new Date(data.period.start).toLocaleDateString()} — now`);
      console.log(`  Total Spend:   ${chalk.bold(formatUsd(data.totalSpend))}`);
      if (data.spendLimit !== null) {
        console.log(`  Spend Limit:   ${formatUsd(data.spendLimit)}`);
      }
      console.log(`  Credit Balance: ${formatUsd(data.creditBalance)} (+ ${formatUsd(data.freeCreditBalance)} free)`);

      if (data.breakdown.length > 0) {
        heading("Breakdown");
        const rows = data.breakdown
          .sort((a, b) => b.cost - a.cost)
          .map((row) => [
            row.model,
            row.operation,
            String(row.count),
            formatNumber(row.inputTokens),
            formatNumber(row.outputTokens),
            formatUsd(row.cost),
          ]);
        table(rows, ["Model", "Operation", "Calls", "Input", "Output", "Cost"]);
      }

      console.log();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to fetch usage");
      process.exit(1);
    }
  });
