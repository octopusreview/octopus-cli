import chalk from "chalk";

export function success(msg: string): void {
  console.log(chalk.green("✓") + " " + msg);
}

export function error(msg: string): void {
  console.error(chalk.red("✗") + " " + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow("!") + " " + msg);
}

export function info(msg: string): void {
  console.log(chalk.blue("ℹ") + " " + msg);
}

export function heading(msg: string): void {
  console.log("\n" + chalk.bold(msg));
}

export function table(rows: string[][], headers?: string[]): void {
  const allRows = headers ? [headers, ...rows] : rows;

  // Calculate column widths
  const colWidths: number[] = [];
  for (const row of allRows) {
    for (let i = 0; i < row.length; i++) {
      colWidths[i] = Math.max(colWidths[i] ?? 0, stripAnsi(row[i]).length);
    }
  }

  // Print header
  if (headers) {
    const headerLine = headers
      .map((h, i) => chalk.bold(h.padEnd(colWidths[i])))
      .join("  ");
    console.log(headerLine);
    console.log(colWidths.map((w) => "─".repeat(w)).join("──"));
  }

  // Print rows
  const dataRows = headers ? rows : allRows;
  for (const row of dataRows) {
    const line = row
      .map((cell, i) => {
        const padding = colWidths[i] - stripAnsi(cell).length;
        return cell + " ".repeat(Math.max(0, padding));
      })
      .join("  ");
    console.log(line);
  }
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function statusBadge(status: string): string {
  switch (status) {
    case "indexed":
    case "ready":
    case "completed":
    case "done":
      return chalk.green(status);
    case "indexing":
    case "analyzing":
    case "reviewing":
    case "processing":
      return chalk.yellow(status);
    case "failed":
    case "error":
      return chalk.red(status);
    case "pending":
    case "none":
      return chalk.dim(status);
    default:
      return status;
  }
}
