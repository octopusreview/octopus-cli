import { Command } from "commander";
import { resolveRepo } from "../../lib/repo-resolver.js";
import { apiPost } from "../../lib/api-client.js";
import { error, success, info } from "../../lib/output.js";
import { createSpinner } from "../../lib/spinner.js";

/**
 * Parse PR identifier — supports:
 * - PR number: 123
 * - GitHub URL: https://github.com/owner/repo/pull/123
 */
function parsePrArg(arg: string): { prNumber: number; repoFullName?: string } {
  // Try as a number
  const num = parseInt(arg, 10);
  if (!isNaN(num)) {
    return { prNumber: num };
  }

  // Try as a GitHub URL
  const match = arg.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (match) {
    return { prNumber: parseInt(match[2], 10), repoFullName: match[1] };
  }

  // Try as a Bitbucket URL
  const bbMatch = arg.match(/bitbucket\.org\/([^/]+\/[^/]+)\/pull-requests\/(\d+)/);
  if (bbMatch) {
    return { prNumber: parseInt(bbMatch[2], 10), repoFullName: bbMatch[1] };
  }

  throw new Error(`Invalid PR identifier: "${arg}". Use a PR number or URL.`);
}

export async function reviewAction(prArg: string | undefined, opts: { pr?: string }) {
  const resolved = prArg ?? opts.pr;
  if (!resolved) {
    error("Missing PR identifier. Usage: octopus review <pr> or octopus review --pr <pr>");
    process.exit(1);
  }
  try {
    const spinner = createSpinner("Resolving pull request...").start();
    const { prNumber, repoFullName } = parsePrArg(resolved);

    const repo = await resolveRepo(repoFullName);
    spinner.text = `Starting review for ${repo.fullName} PR #${prNumber}...`;

    await apiPost(`/api/cli/repos/${repo.id}/review`, { prNumber });
    spinner.succeed(`Review triggered for ${repo.fullName} PR #${prNumber}`);
    info("The review will be posted as a comment on the PR when complete.");
  } catch (err: unknown) {
    error(err instanceof Error ? err.message : "Failed to trigger review");
    process.exit(1);
  }
}

export const PR_ARG_DESC = "PR number or URL (e.g. 123 or https://github.com/owner/repo/pull/123)";

export const prReviewCommand = new Command("review")
  .argument("[pr]", PR_ARG_DESC)
  .option("--pr <pr>", PR_ARG_DESC)
  .description("Trigger an AI review on a pull request")
  .action(reviewAction);
