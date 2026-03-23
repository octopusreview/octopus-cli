import { Command } from "commander";
import { readdir, readFile, mkdir, writeFile, access } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import chalk from "chalk";
import { success, error, info, table } from "../lib/output.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SKILLS_DIR = resolve(__dirname, "..", "..", "src", "skiils");

const CLAUDE_DIR = join(homedir(), ".claude", "commands");
const CODEX_DIR = join(homedir(), ".agents", "skills");

interface SkillMeta {
  fileName: string;
  name: string;
  description: string;
}

function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: "", description: "" };

  const fm = match[1];
  const name = fm.match(/(?:^|\n)name:\s*(.+)/)?.[1]?.trim() ?? "";
  const desc =
    fm.match(/(?:^|\n)description:\s*(.+)/)?.[1]?.trim() ?? "";
  return { name, description: desc };
}

async function getSkills(): Promise<SkillMeta[]> {
  try {
    const files = await readdir(SKILLS_DIR);
    const skills: SkillMeta[] = [];
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const content = await readFile(join(SKILLS_DIR, file), "utf-8");
      const { name, description } = parseSkillFrontmatter(content);
      skills.push({
        fileName: file,
        name: name || file.replace(/\.md$/, ""),
        description,
      });
    }
    return skills;
  } catch {
    return [];
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function installForClaude(skills: SkillMeta[]): Promise<number> {
  await mkdir(CLAUDE_DIR, { recursive: true });
  let count = 0;
  for (const skill of skills) {
    const src = join(SKILLS_DIR, skill.fileName);
    const dest = join(CLAUDE_DIR, skill.fileName);
    const content = await readFile(src, "utf-8");
    await writeFile(dest, content, "utf-8");
    count++;
  }
  return count;
}

async function installForCodex(skills: SkillMeta[]): Promise<number> {
  let count = 0;
  for (const skill of skills) {
    const skillName = skill.fileName.replace(/\.md$/, "");
    const skillDir = join(CODEX_DIR, skillName);
    await mkdir(skillDir, { recursive: true });

    const src = join(SKILLS_DIR, skill.fileName);
    const content = await readFile(src, "utf-8");

    // Codex expects SKILL.md inside a named directory
    await writeFile(join(skillDir, "SKILL.md"), content, "utf-8");
    count++;
  }
  return count;
}

// --- Commands ---

const installCommand = new Command("install")
  .description("Install Octopus skills for Claude Code and/or Codex")
  .option("--claude", "Install only for Claude Code")
  .option("--codex", "Install only for Codex")
  .action(async (opts: { claude?: boolean; codex?: boolean }) => {
    const skills = await getSkills();
    if (skills.length === 0) {
      error("No skills found to install.");
      return;
    }

    const both = !opts.claude && !opts.codex;
    let claudeCount = 0;
    let codexCount = 0;

    if (both || opts.claude) {
      claudeCount = await installForClaude(skills);
      success(`Installed ${claudeCount} skill(s) to ${chalk.dim(CLAUDE_DIR)}`);
    }

    if (both || opts.codex) {
      codexCount = await installForCodex(skills);
      success(`Installed ${codexCount} skill(s) to ${chalk.dim(CODEX_DIR)}`);
    }

    console.log();
    for (const skill of skills) {
      info(`${chalk.bold(skill.name)} — ${skill.description || chalk.dim("no description")}`);
    }
  });

const listCommand = new Command("list")
  .description("List available Octopus skills and their install status")
  .action(async () => {
    const skills = await getSkills();
    if (skills.length === 0) {
      info("No skills available.");
      return;
    }

    const rows: string[][] = [];
    for (const skill of skills) {
      const claudeInstalled = await exists(join(CLAUDE_DIR, skill.fileName));
      const codexInstalled = await exists(join(CODEX_DIR, skill.fileName.replace(/\.md$/, ""), "SKILL.md"));

      rows.push([
        chalk.bold(skill.name),
        skill.description || chalk.dim("—"),
        claudeInstalled ? chalk.green("yes") : chalk.dim("no"),
        codexInstalled ? chalk.green("yes") : chalk.dim("no"),
      ]);
    }

    table(rows, ["Skill", "Description", "Claude", "Codex"]);
  });

export const skillsCommand = new Command("skills")
  .description("Manage Octopus skills for AI coding agents")
  .addCommand(installCommand)
  .addCommand(listCommand);
