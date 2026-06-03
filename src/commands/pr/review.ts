import { Command } from "commander";
import { resolveRepo } from "../../lib/repo-resolver.js";
import { apiPost } from "../../lib/api-client.js";
import { error, success, info } from "../../lib/output.js";
import { createSpinner } from "../../lib/spinner.js";

/**
 * Parse PR identifier — supports:
 * - PR number: 123
 * - GitHub URL: https://github.com/owner/repo/pull/123
 * - Bitbucket URL: https://bitbucket.org/owner/repo/pull-requests/123
 * - GitLab MR URL: https://gitlab.example.com/group/subgroup/repo/-/merge_requests/123
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

  // Try as a GitLab MR URL (self-hosted, custom host/port, nested subgroups).
  // GitLab separates the project path from the resource with "/-/".
  const glMatch = arg.match(/\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (glMatch) {
    return { prNumber: parseInt(glMatch[2], 10), repoFullName: glMatch[1] };
  }

  throw new Error(`Invalid PR identifier: "${arg}". Use a PR number or URL.`);
}

/**
 * Provider-specific terminology. GitLab calls them "Merge Requests" (MR),
 * everyone else "Pull Requests" (PR). Used for user-facing output, including
 * remapping the backend's generic "pull request" wording.
 */
function prTerms(provider: string): { full: string; short: string } {
  return provider.toLowerCase() === "gitlab"
    ? { full: "merge request", short: "MR" }
    : { full: "pull request", short: "PR" };
}

function localizeMessage(message: string, provider: string): string {
  if (provider.toLowerCase() !== "gitlab") return message;
  // Preserve the casing of the matched "P" → "M" so "Pull request" → "Merge request".
  return message
    .replace(/pull(\s)request/gi, (_m, sp, offset, str) =>
      (str[offset] === "P" ? "Merge" : "merge") + sp + "request",
    )
    .replace(/\bPRs\b/g, "MRs")
    .replace(/\bPR\b/g, "MR");
}

export async function reviewAction(prArg: string | undefined, opts: { pr?: string }) {
  const resolved = prArg ?? opts.pr;
  if (!resolved) {
    error("Missing PR identifier. Usage: octopus review <pr> or octopus review --pr <pr>");
    process.exit(1);
  }
  const spinner = createSpinner("Resolving pull request...").start();
  let provider = "";
  try {
    const { prNumber, repoFullName } = parsePrArg(resolved);

    const repo = await resolveRepo(repoFullName);
    provider = repo.provider;
    const terms = prTerms(provider);
    spinner.text = `Resolving ${terms.full}...`;

    await apiPost(`/api/cli/repos/${repo.id}/review`, { prNumber });
    spinner.succeed(`Review triggered for ${repo.fullName} ${terms.short} #${prNumber}`);
    info(`The review will be posted as a comment on the ${terms.full} when complete.`);
  } catch (err: unknown) {
    spinner.stop();
    const message = err instanceof Error ? err.message : "Failed to trigger review";
    error(localizeMessage(message, provider));
    process.exit(1);
  }
}

export const PR_ARG_DESC = "PR number or URL (e.g. 123 or https://github.com/owner/repo/pull/123)";

export const prReviewCommand = new Command("review")
  .argument("[pr]", PR_ARG_DESC)
  .option("--pr <pr>", PR_ARG_DESC)
  .description("Trigger an AI review on a pull request")
  .action(reviewAction);
