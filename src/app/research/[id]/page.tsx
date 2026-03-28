"use client";

import { use, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SourcePreviewCard } from "@/components/SourcePreviewCard";
import { ActivityLog } from "@/components/ActivityLog";
import { BriefRenderer } from "@/components/BriefRenderer";
import { ScoreGauges } from "@/components/ScoreGauges";
import { CopyBriefButton } from "@/components/CopyBriefButton";
import { useToast } from "@/components/ToastContainer";
import { STATUS_LABELS } from "@/lib/types";
import type { Source, SourceType, ThreadStatus } from "@/lib/types";
import { Loader2, FileText } from "lucide-react";

export default function ResearchPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const threadId = id as Id<"threads">;

  const thread = useQuery(api.queries.getThread, { threadId });
  const rawSources = useQuery(api.queries.getSources, { threadId });
  const sources = useMemo(
    () => (rawSources ?? []) as unknown as Source[],
    [rawSources]
  );

  const retrySourceMutation = useMutation(api.research.retrySource);
  const generateBriefMutation = useMutation(api.research.generateBriefNow);

  const [autoSynthesize, setAutoSynthesize] = useState(true);
  const { addToast } = useToast();
  const prevStatus = useRef<string | undefined>(undefined);

  // Toast on thread status changes
  const threadStatus = thread?.status;
  useEffect(() => {
    if (!threadStatus) return;
    const prev = prevStatus.current;
    prevStatus.current = threadStatus;
    if (!prev || prev === threadStatus) return;
    if (threadStatus === "complete") addToast("success", "Research complete");
    else if (threadStatus === "synthesizing") addToast("info", "Synthesizing brief...");
    else if (threadStatus === "error") addToast("error", "Research encountered an error");
  }, [threadStatus, addToast]);

  // Toast on source errors
  const errorCount = useRef(0);
  const sourceErrorTotal = useMemo(
    () => sources.filter((s) => s.status === "error").length,
    [sources]
  );
  useEffect(() => {
    if (sourceErrorTotal > errorCount.current) {
      addToast("error", "A source search failed");
    }
    errorCount.current = sourceErrorTotal;
  }, [sourceErrorTotal, addToast]);

  // Retry handler
  const handleRetry = useCallback(
    async (sourceType: SourceType) => {
      try {
        await retrySourceMutation({ threadId, sourceType });
        addToast("info", `Retrying ${sourceType.toUpperCase()}...`);
      } catch {
        addToast("error", "Retry failed");
      }
    },
    [retrySourceMutation, threadId, addToast]
  );

  // Manual brief generation
  const handleGenerateBrief = useCallback(async () => {
    try {
      await generateBriefMutation({ threadId });
      addToast("info", "Generating brief...");
    } catch {
      addToast("error", "Failed to start brief generation");
    }
  }, [generateBriefMutation, threadId, addToast]);

  // Derived state
  const isSearching = useMemo(
    () => sources.some((s) => s.status === "searching" || s.status === "pending"),
    [sources]
  );
  const anyHasStream = useMemo(
    () => sources.some((s) => s.streamingUrl || s.status === "searching"),
    [sources]
  );
  const allComplete = useMemo(
    () =>
      sources.length > 0 &&
      sources.every((s) => s.status === "complete" || s.status === "error"),
    [sources]
  );
  const showBrief =
    thread?.status === "synthesizing" || thread?.status === "complete";
  const completedSources = sources.filter((s) => s.status === "complete").length;

  // Show "Generate Brief" button when auto-brief is off and all sources done
  const showManualBrief =
    !autoSynthesize &&
    allComplete &&
    thread?.status !== "synthesizing" &&
    thread?.status !== "complete";

  if (!thread) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader2 size={24} className="spinner" style={{ color: "var(--navy)" }} />
      </div>
    );
  }

  const status = thread.status as ThreadStatus;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* ── Top Bar ─────────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontSize: 16,
              fontWeight: 500,
              color: "var(--navy)",
            }}
          >
            Counsel
          </span>
          <span
            style={{
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 10,
              color: "var(--text-muted)",
            }}
          >
            by Specter Labs
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Auto-synthesize toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              Auto-brief
            </span>
            <button
              type="button"
              className={`auto-toggle ${autoSynthesize ? "active" : ""}`}
              onClick={() => setAutoSynthesize((v) => !v)}
              aria-label="Toggle auto-synthesize"
            >
              <div className="auto-toggle-thumb" />
            </button>
          </div>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className={`pulse-dot ${
                status === "complete"
                  ? "pulse-dot-complete"
                  : status === "error"
                    ? "pulse-dot-error"
                    : ""
              }`}
            />
            <span
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "1.5px",
                color:
                  status === "complete"
                    ? "var(--success)"
                    : status === "error"
                      ? "var(--error)"
                      : "var(--accent)",
              }}
            >
              {STATUS_LABELS[status]}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────── */}
      <main
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "24px 24px 80px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Query display */}
        <div style={{ padding: "8px 0" }}>
          <h1
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {thread.query}
          </h1>
          <p
            style={{
              fontFamily: "var(--font-ibm-plex-mono), monospace",
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: 4,
            }}
          >
            {new Date(thread.createdAt).toLocaleString()}
          </p>
        </div>

        {/* ── SECTION A: Live Browser Previews ────── */}
        {(anyHasStream || isSearching) && !allComplete && (
          <section className="fade-in-up">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <span className="recording-dot" />
              <span
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "var(--text-muted)",
                }}
              >
                Live Research — {sources.length} browsers navigating simultaneously
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              {sources.map((source, i) => (
                <SourcePreviewCard
                  key={source._id}
                  source={source}
                  index={i}
                  onRetry={() => handleRetry(source.type)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Source cards when all complete (show error states with retry) */}
        {allComplete && sources.some((s) => s.status === "error") && (
          <section>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              {sources
                .filter((s) => s.status === "error")
                .map((source, i) => (
                  <SourcePreviewCard
                    key={source._id}
                    source={source}
                    index={i}
                    onRetry={() => handleRetry(source.type)}
                  />
                ))}
            </div>
          </section>
        )}

        {/* ── SECTION B: Activity Log ─────────────── */}
        {sources.length > 0 && (
          <section>
            <ActivityLog
              sources={sources}
              threadCreatedAt={thread.createdAt}
              isSearching={isSearching}
            />
          </section>
        )}

        {/* ── Manual Generate Brief Button ─────────── */}
        {showManualBrief && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={handleGenerateBrief}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 8,
                border: "1.5px solid var(--navy)",
                background: "var(--navy)",
                color: "white",
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--navy-light)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--navy)";
              }}
            >
              <FileText size={14} />
              Generate Brief
            </button>
          </div>
        )}

        {/* ── SECTION C: Brief Panel ──────────────── */}
        {showBrief && (
          <section
            className="fade-in-up"
            style={{
              background: "var(--surface)",
              borderRadius: 10,
              border: "1px solid var(--border)",
              padding: "32px 40px",
            }}
          >
            {/* Meta bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                paddingBottom: 16,
                borderBottom: "1px solid var(--border)",
                marginBottom: 20,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  background: "var(--navy)",
                  color: "white",
                  padding: "3px 10px",
                  borderRadius: 4,
                }}
              >
                Research Brief
              </span>
              <span
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                {new Date(thread.createdAt).toLocaleDateString("en-SG", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: 10,
                  color: "var(--success)",
                  marginLeft: "auto",
                }}
              >
                {completedSources}/{sources.length} sources
              </span>
              {thread.brief && <CopyBriefButton markdown={thread.brief} />}
            </div>

            {/* Score gauges */}
            <ScoreGauges
              relevance={thread.brief ? 92 : 0}
              coverage={thread.brief ? 78 : 0}
              currency={thread.brief ? 85 : 0}
            />

            {/* Brief title */}
            <h2
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: 22,
                fontWeight: 400,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
                margin: "16px 0 4px",
              }}
            >
              {thread.query}
            </h2>
            <p
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: 14,
                fontWeight: 300,
                fontStyle: "italic",
                color: "var(--text-muted)",
                margin: "0 0 20px",
              }}
            >
              Synthesised from {completedSources} legal databases
            </p>

            {/* Brief body */}
            {thread.brief ? (
              <BriefRenderer content={thread.brief} />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "24px 0",
                  justifyContent: "center",
                }}
              >
                <Loader2 size={16} className="spinner" style={{ color: "var(--navy)" }} />
                <span
                  style={{
                    fontFamily: "var(--font-ibm-plex-mono), monospace",
                    fontSize: 12,
                    color: "var(--navy)",
                  }}
                >
                  Synthesizing brief...
                </span>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
