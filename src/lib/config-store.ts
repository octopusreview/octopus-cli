import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CliConfig, CliProfile } from "../types.js";

const CONFIG_DIR = join(homedir(), ".config", "octopus");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): CliConfig {
  try {
    const data = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { profiles: {}, activeProfile: "default" };
  }
}

export function saveConfig(config: CliConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {}
}

export function getActiveProfile(): CliProfile | null {
  const config = loadConfig();
  return config.profiles[config.activeProfile] ?? null;
}

export function setProfile(name: string, profile: CliProfile): void {
  const config = loadConfig();
  config.profiles[name] = profile;
  config.activeProfile = name;
  saveConfig(config);
}

export function removeProfile(name: string): void {
  const config = loadConfig();
  delete config.profiles[name];
  if (config.activeProfile === name) {
    const remaining = Object.keys(config.profiles);
    config.activeProfile = remaining[0] ?? "default";
  }
  saveConfig(config);
}

export function getApiUrl(): string {
  return process.env.OCTOPUS_API_URL
    ?? getActiveProfile()?.apiUrl
    ?? "https://octopus-review.ai";
}

export function getApiToken(): string | null {
  return process.env.OCTOPUS_API_KEY
    ?? getActiveProfile()?.token
    ?? null;
}
