import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

interface SearchResult {
  file: string;
  line: number;
  content: string;
}

interface SearchResponse {
  results: SearchResult[];
  summary: string;
}

const MAX_SUMMARY_SIZE = 15 * 1024; // 15KB

/**
 * Extract likely search keywords from a natural language query.
 */
function extractKeywords(query: string): string[] {
  // Remove common filler words
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "this", "that", "these",
    "those", "i", "you", "he", "she", "it", "we", "they", "what", "which",
    "who", "when", "where", "why", "how", "all", "each", "every", "both",
    "few", "more", "most", "other", "some", "such", "no", "not", "only",
    "same", "so", "than", "too", "very", "just", "but", "and", "or",
    "if", "because", "about", "find", "search", "show", "me", "tell",
    "explain", "code", "function", "file", "used", "using", "called",
    "where", "does", "defined", "nerede", "nasil", "ne", "bu", "bir",
    "ve", "ile", "icin", "mi", "var", "yok",
  ]);

  // Split on word boundaries and filter
  const words = query
    .replace(/[^\w\s.-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));

  // Also extract quoted strings as exact phrases
  const quoted = query.match(/"([^"]+)"|'([^']+)'/g);
  if (quoted) {
    words.push(...quoted.map((q) => q.replace(/["']/g, "")));
  }

  // Extract camelCase/PascalCase identifiers (likely code references)
  const identifiers = query.match(/[A-Z][a-z]+[A-Z]\w+|[a-z]+[A-Z]\w+/g);
  if (identifiers) {
    words.unshift(...identifiers); // prioritize these
  }

  // Deduplicate
  return [...new Set(words)].slice(0, 10);
}

/**
 * Run ripgrep with a pattern in a directory.
 */
function ripgrep(pattern: string, dir: string, maxResults = 20): SearchResult[] {
  try {
    const rgCmd = `rg --no-heading --line-number --max-count 5 --max-columns 200 --type-add 'code:*.{ts,tsx,js,jsx,py,go,rs,java,rb,php,c,cpp,h,cs,swift,kt,scala,vue,svelte}' --type code --glob '!node_modules' --glob '!dist' --glob '!.git' --glob '!*.lock' --glob '!*.min.*' -- ${JSON.stringify(pattern)} ${JSON.stringify(dir)}`;
    const output = execSync(rgCmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 1024 * 1024,
      timeout: 5000,
    });

    return output
      .split("\n")
      .filter(Boolean)
      .slice(0, maxResults)
      .map((line) => {
        // Format: filepath:line:content
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (!match) return null;
        const filePath = match[1].startsWith(dir)
          ? match[1].slice(dir.length + 1)
          : match[1];
        return {
          file: filePath,
          line: parseInt(match[2], 10),
          content: match[3].trim(),
        };
      })
      .filter((r): r is SearchResult => r !== null);
  } catch {
    return [];
  }
}

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".rb", ".php",
  ".c", ".cpp", ".h", ".cs", ".swift", ".kt",
  ".scala", ".vue", ".svelte",
]);

const SKIP_DIRS = new Set([
  "node_modules", "dist", ".git", ".next", "build",
  "out", "coverage", "__pycache__", ".turbo", "vendor",
]);

/**
 * Pure Node.js fallback search — works on all platforms (macOS, Linux, Windows).
 * Walks the directory tree, reads code files, and matches lines.
 */
function nodeSearch(pattern: string, dir: string, maxResults = 20): SearchResult[] {
  const results: SearchResult[] = [];
  const regex = new RegExp(escapeRegex(pattern), "i");

  function walk(currentDir: string): void {
    if (results.length >= maxResults) return;

    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;

      const fullPath = join(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && CODE_EXTENSIONS.has(extname(entry))) {
        // Skip large files (>200KB)
        if (stat.size > 200_000) continue;

        try {
          const content = readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          let matchCount = 0;

          for (let i = 0; i < lines.length; i++) {
            if (matchCount >= 5) break;
            if (regex.test(lines[i])) {
              results.push({
                file: relative(dir, fullPath),
                line: i + 1,
                content: lines[i].trim().slice(0, 200),
              });
              matchCount++;
              if (results.length >= maxResults) return;
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(dir);
  return results;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if ripgrep is available.
 */
function hasRipgrep(): boolean {
  try {
    execSync("rg --version", { stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file and return content with line numbers.
 */
function readFile(filePath: string, repoDir: string): string | null {
  const fullPath = join(repoDir, filePath);
  if (!existsSync(fullPath)) return null;
  try {
    const content = readFileSync(fullPath, "utf-8");
    return content
      .split("\n")
      .map((line, i) => `${i + 1}: ${line}`)
      .join("\n");
  } catch {
    return null;
  }
}

/**
 * Perform a semantic search using keyword extraction + parallel ripgrep.
 */
export async function semanticSearch(query: string, repoDir: string): Promise<SearchResponse> {
  const keywords = extractKeywords(query);
  const useRg = hasRipgrep();
  const searchFn = useRg ? ripgrep : nodeSearch;

  // Run searches for all keywords in parallel
  const allResults: SearchResult[] = [];
  const seenKeys = new Set<string>();

  for (const keyword of keywords) {
    const results = searchFn(keyword, repoDir, 15);
    for (const r of results) {
      const key = `${r.file}:${r.line}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allResults.push(r);
      }
    }
  }

  // Score results — files matching more keywords rank higher
  const fileScores = new Map<string, number>();
  for (const r of allResults) {
    fileScores.set(r.file, (fileScores.get(r.file) ?? 0) + 1);
  }

  // Sort by file frequency (multi-keyword matches first), then by line number
  allResults.sort((a, b) => {
    const scoreA = fileScores.get(a.file) ?? 0;
    const scoreB = fileScores.get(b.file) ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.line - b.line;
  });

  // Build summary
  const topResults = allResults.slice(0, 30);
  const summary = buildSummary(topResults, keywords, repoDir);

  return { results: topResults, summary };
}

/**
 * Perform a direct grep search.
 */
export async function grepSearch(pattern: string, repoDir: string): Promise<SearchResponse> {
  const useRg = hasRipgrep();
  const searchFn = useRg ? ripgrep : nodeSearch;
  const results = searchFn(pattern, repoDir, 30);
  const summary = buildSummary(results, [pattern], repoDir);
  return { results, summary };
}

/**
 * Read specific files.
 */
export async function fileReadSearch(filePaths: string[], repoDir: string): Promise<SearchResponse> {
  const results: SearchResult[] = [];
  const summaryParts: string[] = [];

  for (const fp of filePaths.slice(0, 5)) {
    const content = readFile(fp, repoDir);
    if (content) {
      summaryParts.push(`### ${fp}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``);
      // Add a synthetic result for each file
      results.push({ file: fp, line: 1, content: `[file content: ${content.split("\n").length} lines]` });
    }
  }

  const summary = summaryParts.join("\n\n").slice(0, MAX_SUMMARY_SIZE);
  return { results, summary };
}

/**
 * Build a context summary from search results.
 * Groups results by file and includes surrounding context.
 */
function buildSummary(results: SearchResult[], keywords: string[], repoDir: string): string {
  if (results.length === 0) {
    return `No results found for: ${keywords.join(", ")}`;
  }

  // Group by file
  const byFile = new Map<string, SearchResult[]>();
  for (const r of results) {
    const existing = byFile.get(r.file) ?? [];
    existing.push(r);
    byFile.set(r.file, existing);
  }

  const parts: string[] = [`Search results for: ${keywords.join(", ")}\n`];

  for (const [file, fileResults] of byFile) {
    parts.push(`### ${file}`);

    // Try to read surrounding lines for context
    const fullPath = join(repoDir, file);
    let fileLines: string[] | null = null;
    try {
      if (existsSync(fullPath)) {
        fileLines = readFileSync(fullPath, "utf-8").split("\n");
      }
    } catch {}

    for (const r of fileResults.slice(0, 5)) {
      if (fileLines) {
        // Show 2 lines before and after for context
        const start = Math.max(0, r.line - 3);
        const end = Math.min(fileLines.length, r.line + 2);
        const contextLines = fileLines
          .slice(start, end)
          .map((l, i) => `${start + i + 1}: ${l}`)
          .join("\n");
        parts.push(`\`\`\`\n${contextLines}\n\`\`\``);
      } else {
        parts.push(`L${r.line}: ${r.content}`);
      }
    }
    parts.push("");
  }

  const summary = parts.join("\n");
  return summary.length > MAX_SUMMARY_SIZE
    ? summary.slice(0, MAX_SUMMARY_SIZE)
    : summary;
}
