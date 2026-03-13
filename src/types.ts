export interface CliConfig {
  profiles: Record<string, CliProfile>;
  activeProfile: string;
}

export interface CliProfile {
  apiUrl: string;
  token: string;
  orgSlug: string;
  orgId: string;
}

export interface ApiRepo {
  id: string;
  name: string;
  fullName: string;
  provider: string;
  defaultBranch: string;
  indexStatus: string;
  indexedAt: string | null;
  indexedFiles: number;
  totalFiles: number;
  totalChunks: number;
  totalVectors?: number;
  indexDurationMs?: number;
  analysisStatus: string;
  analyzedAt: string | null;
  analysis?: string;
  summary: string | null;
  purpose: string | null;
  autoReview: boolean;
  contributorCount?: number;
  _count: { pullRequests: number };
}

export interface UsageBreakdown {
  model: string;
  operation: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  sourceType: string;
  fileName: string | null;
  status: string;
  totalChunks: number;
  totalVectors: number;
  createdAt: string;
}
