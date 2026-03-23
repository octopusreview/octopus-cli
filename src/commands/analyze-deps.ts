import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { apiSSE } from "../lib/api-client.js";
import { heading, table, info, error as errorMsg, success } from "../lib/output.js";

interface RiskReport {
  package: string;
  version: string;
  file: string;
  isDevDependency: boolean;
  overallRisk: string;
  totalScore: number;
  signals: { source: string; description: string; score: number }[];
  recommendation: string;
  isSecurityHolding: boolean;
}

const RISK_LABEL: Record<string, string> = {
  critical: chalk.red("CRITICAL"),
  high: chalk.hex("#FF8C00")("HIGH"),
  medium: chalk.yellow("MEDIUM"),
  low: chalk.blue("LOW"),
  clean: chalk.green("CLEAN"),
};

export const analyzeDepsCommand = new Command("analyze-deps")
  .description("Analyze npm dependencies in a GitHub repository for security risks")
  .argument("<repo-url>", "GitHub repository URL (e.g., https://github.com/owner/repo)")
  .action(async (repoUrl: string) => {
    const spinner = ora("Starting package analysis...").start();
    let reports: RiskReport[] = [];
    let repoName = "";
    let cached = false;
    let analysisId = "";
    let hasError = false;

    try {
      await apiSSE("/api/analyze-deps", { repoUrl }, (event, data) => {
        switch (event) {
          case "progress":
            spinner.text = (data.message as string) ?? "Analyzing...";
            break;
          case "finding": {
            const risk = (data.risk as string) ?? "unknown";
            const pkg = (data.package as string) ?? "";
            const score = (data.score as number) ?? 0;
            spinner.info(`${RISK_LABEL[risk] ?? risk} ${pkg} (score: ${score})`);
            spinner.start("Continuing analysis...");
            break;
          }
          case "complete":
            reports = (data.reports as RiskReport[]) ?? [];
            repoName = (data.repoName as string) ?? "";
            cached = (data.cached as boolean) ?? false;
            analysisId = (data.analysisId as string) ?? "";
            break;
          case "error":
            hasError = true;
            spinner.fail((data.message as string) ?? "Analysis failed");
            break;
        }
      });

      if (hasError) {
        process.exit(1);
      }

      if (cached) {
        spinner.succeed("Found cached analysis (same commit hash)");
      } else {
        spinner.succeed("Analysis complete");
      }

      console.log();

      if (reports.length === 0) {
        success("All dependencies look clean!");
        return;
      }

      // Summary
      const critical = reports.filter((r) => r.overallRisk === "critical").length;
      const high = reports.filter((r) => r.overallRisk === "high").length;
      const medium = reports.filter((r) => r.overallRisk === "medium").length;
      const low = reports.filter((r) => r.overallRisk === "low").length;
      const clean = reports.filter((r) => r.overallRisk === "clean").length;

      const parts: string[] = [];
      if (critical) parts.push(chalk.red(`${critical} critical`));
      if (high) parts.push(chalk.hex("#FF8C00")(`${high} high`));
      if (medium) parts.push(chalk.yellow(`${medium} medium`));
      if (low) parts.push(chalk.blue(`${low} low`));
      if (clean) parts.push(chalk.green(`${clean} clean`));
      info(`${reports.length} packages: ${parts.join(", ")}`);
      console.log();

      // Table for risky packages
      const risky = reports.filter((r) => r.overallRisk !== "clean");
      if (risky.length > 0) {
        table(
          risky.map((r) => [
            RISK_LABEL[r.overallRisk] ?? r.overallRisk,
            r.package,
            String(r.totalScore),
            r.file,
            r.signals.map((s) => s.description).join("; ").slice(0, 80),
          ]),
          ["Risk", "Package", "Score", "File", "Signals"],
        );
      }

      // Detailed findings for critical/high
      const urgent = reports.filter((r) => r.overallRisk === "critical" || r.overallRisk === "high");
      if (urgent.length > 0) {
        console.log();
        heading("Detailed Findings");
        for (const report of urgent) {
          console.log();
          console.log(`  ${RISK_LABEL[report.overallRisk]} ${chalk.bold(report.package)}@${report.version} (score: ${report.totalScore})`);
          console.log(`  ${chalk.dim(report.file)}`);
          if (report.isSecurityHolding) {
            console.log(`  ${chalk.red.bold("⚠ CONFIRMED MALICIOUS — removed by npm security team")}`);
          }
          for (const signal of report.signals) {
            console.log(`    ${chalk.yellow("⚠")} [${signal.source}] ${signal.description}`);
          }
          if (report.recommendation) {
            console.log(`    ${chalk.dim("→")} ${report.recommendation}`);
          }
        }
      }

      if (analysisId) {
        console.log();
        info(`Analysis ID: ${analysisId}`);
      }

      // Exit code based on severity
      if (critical > 0) process.exit(2);
      if (high > 0) process.exit(1);
    } catch (err) {
      spinner.fail("Analysis failed");
      errorMsg(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
