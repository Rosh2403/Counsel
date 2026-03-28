export type ThreadStatus = "analyzing" | "searching" | "evaluating" | "synthesizing" | "complete" | "error";
export type SourceType = "sso" | "mas" | "cases";
export type SourceStatus = "pending" | "searching" | "complete" | "error";

export interface Thread {
  _id: string;
  query: string;
  status: ThreadStatus;
  sourcesPlan: string[];
  brief?: string;
  createdAt: number;
}

export interface ProgressStep {
  text: string;
  timestamp: number;
}

export type ErrorKind = "no_api_key" | "database_unavailable" | "timeout" | "network_error" | "unknown";

export interface SourceError {
  kind: ErrorKind;
  message: string;
  helpMessage: string;
}

export interface Source {
  _id: string;
  threadId: string;
  type: SourceType;
  status: SourceStatus;
  query: string;
  url: string;
  results?: Record<string, unknown>;
  retryCount: number;
  streamingUrl?: string;
  progressSteps?: ProgressStep[];
  error?: SourceError;
}

export const STATUS_LABELS: Record<ThreadStatus, string> = {
  analyzing: "Analyzing",
  searching: "Searching",
  evaluating: "Evaluating",
  synthesizing: "Synthesizing",
  complete: "Complete",
  error: "Error",
};

export const SOURCE_META: Record<SourceType, { label: string; name: string; color: string }> = {
  sso: { label: "SSO", name: "Singapore Statutes Online", color: "#1B2A4A" },
  mas: { label: "MAS", name: "Monetary Authority of Singapore", color: "#B8860B" },
  cases: { label: "Cases", name: "eLitigation", color: "#2D6A4F" },
};

export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) return `${minutes}:${String(secs).padStart(2, "0")}`;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${secs}.${tenths}s`;
}
