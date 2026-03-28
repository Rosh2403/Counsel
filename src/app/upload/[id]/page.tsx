"use client";

import { use, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SourcePreviewCard } from "@/components/SourcePreviewCard";
import { BriefRenderer } from "@/components/BriefRenderer";
import { DownloadPdfButton } from "@/components/DownloadPdfButton";
import { useToast } from "@/components/ToastContainer";
import { ShareButton } from "@/components/ShareButton";
import type { Source } from "@/lib/types";
import {
  Loader2,
  ChevronDown,
  Shield,
  FileText,
  ExternalLink,
} from "lucide-react";

const DOC_STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  analyzing: "Analyzing...",
  verifying: "Verifying...",
  complete: "Complete",
  error: "Error",
};

interface Entity {
  name: string;
  type: string;
  role: string;
  context: string;
}
interface Risk {
  clause_text: string;
  risk_level: string;
  risk_type: string;
  explanation: string;
  recommendation: string;
}
interface Clause {
  clause_number: string;
  clause_title: string;
  clause_type: string;
  summary: string;
}

export default function UploadAnalysisPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(props.params);
  const documentId = id as Id<"documents">;

  const document = useQuery(api.documents.getDocument, { documentId });
  const analysis = useQuery(api.documents.getAnalysis, { documentId });

  // Subscribe to verification sources when thread exists
  const verificationThreadId = document?.verificationThreadId;
  const rawSources = useQuery(
    api.queries.getSources,
    verificationThreadId ? { threadId: verificationThreadId } : "skip",
  );
  const sources = useMemo(
    () => (rawSources ?? []) as unknown as Source[],
    [rawSources],
  );

  const startResearch = useMutation(api.research.startResearch);
  const linkResearchThread = useMutation(api.documents.linkResearchThread);
  const { addToast } = useToast();
  const [clausesOpen, setClausesOpen] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  // Track linked research thread
  const linkedThreadId = analysis?.linkedThreadId;
  const linkedThread = useQuery(
    api.queries.getThread,
    linkedThreadId ? { threadId: linkedThreadId } : "skip",
  );
  const linkedSources = useQuery(
    api.queries.getSources,
    linkedThreadId ? { threadId: linkedThreadId } : "skip",
  );
  const linkedCompletedSources = (linkedSources ?? []).filter(
    (s: { status: string }) => s.status === "complete",
  ).length;

  // Derived state
  const isSearching = sources.some(
    (s) => s.status === "searching" || s.status === "pending",
  );
  const anyHasStream = sources.some(
    (s) => s.streamingUrl || s.status === "searching",
  );

  // Parse analysis data
  const entities = useMemo(() => {
    if (!analysis?.entities) return [];
    const data = analysis.entities as { entities?: Entity[] } | Entity[];
    return Array.isArray(data) ? data : data?.entities ?? [];
  }, [analysis?.entities]);

  const risks = useMemo(() => {
    if (!analysis?.riskFlags) return [];
    const data = analysis.riskFlags as { risks?: Risk[] } | Risk[];
    return Array.isArray(data) ? data : data?.risks ?? [];
  }, [analysis?.riskFlags]);

  const clauses = useMemo(() => {
    if (!analysis?.clauses) return [];
    const data = analysis.clauses as { clauses?: Clause[] } | Clause[];
    return Array.isArray(data) ? data : data?.clauses ?? [];
  }, [analysis?.clauses]);

  const handleSuggestedQuery = useCallback(
    async (query: string) => {
      setPendingQuery(query);
      addToast("info", "Starting legal research...");
      try {
        const threadId = await startResearch({ query });

        // Link analysis to research thread
        if (analysis?._id) {
          await linkResearchThread({
            analysisId: analysis._id as Id<"documentAnalysis">,
            threadId,
          }).catch(() => {}); // non-fatal
        }

        window.open(`/research/${threadId}`, "_blank");
      } catch {
        addToast("error", "Failed to start research");
      } finally {
        setPendingQuery(null);
      }
    },
    [startResearch, linkResearchThread, analysis?._id, addToast],
  );

  const riskColor: Record<string, string> = {
    high: "var(--error)",
    medium: "var(--accent)",
    low: "var(--success)",
  };

  if (!document) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader2
          size={24}
          className="spinner"
          style={{ color: "var(--navy)" }}
        />
      </div>
    );
  }

  const status = document.status;

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

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ShareButton />
          <span
            className={`pulse-dot ${status === "complete" ? "pulse-dot-complete" : status === "error" ? "pulse-dot-error" : ""}`}
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
            {DOC_STATUS_LABELS[status] ?? status}
          </span>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────── */}
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
        {/* Document header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FileText size={18} style={{ color: "var(--navy)" }} />
          <div>
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
              {document.fileName}
            </h1>
            <p
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: 10,
                color: "var(--text-muted)",
                marginTop: 2,
              }}
            >
              {new Date(document.createdAt).toLocaleString()}
            </p>
          </div>
          {analysis?.documentType && (
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
                marginLeft: "auto",
              }}
            >
              {analysis.documentType.replace(/_/g, " ")}
            </span>
          )}
        </div>

        {/* ── SECTION A: Analysis Results ─────────── */}
        {analysis && (
          <div
            className="fade-in-up"
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {/* Summary */}
            {analysis.summary && (
              <section
                style={{
                  background: "var(--surface)",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  padding: "20px 24px",
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
                  Summary
                </span>
                <p
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                    fontSize: 14,
                    color: "var(--text-secondary)",
                    lineHeight: 1.75,
                    marginTop: 12,
                  }}
                >
                  {analysis.summary}
                </p>
              </section>
            )}

            {/* Entities */}
            {entities.length > 0 && (
              <section
                style={{
                  background: "var(--surface)",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  padding: "20px 24px",
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    color: "var(--navy)",
                    margin: "0 0 12px",
                  }}
                >
                  Key Entities
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {entities.map((e, i) => (
                    <div
                      key={i}
                      className="fade-in-up"
                      style={{
                        animationDelay: `${i * 80}ms`,
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontFamily:
                            "var(--font-dm-sans), system-ui, sans-serif",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {e.name}
                      </span>
                      <span
                        style={{
                          fontFamily:
                            "var(--font-ibm-plex-mono), monospace",
                          fontSize: 9,
                          padding: "1px 6px",
                          borderRadius: 100,
                          background: "var(--navy-muted)",
                          color: "var(--navy)",
                          textTransform: "uppercase",
                        }}
                      >
                        {e.type}
                      </span>
                      <span
                        style={{
                          fontFamily:
                            "var(--font-dm-sans), system-ui, sans-serif",
                          fontSize: 12,
                          color: "var(--text-muted)",
                        }}
                      >
                        {e.context}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Risks */}
            {risks.length > 0 && (
              <section
                style={{
                  background: "var(--surface)",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  padding: "20px 24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Shield size={14} style={{ color: "var(--navy)" }} />
                  <h3
                    style={{
                      fontFamily:
                        "var(--font-dm-sans), system-ui, sans-serif",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      color: "var(--navy)",
                      margin: 0,
                    }}
                  >
                    Risk Analysis
                  </h3>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {risks.map((r, i) => (
                    <div
                      key={i}
                      className="fade-in-up"
                      style={{
                        animationDelay: `${i * 80}ms`,
                        borderLeft: `3px solid ${riskColor[r.risk_level] ?? "var(--border)"}`,
                        paddingLeft: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontFamily:
                              "var(--font-ibm-plex-mono), monospace",
                            fontSize: 9,
                            textTransform: "uppercase",
                            color:
                              riskColor[r.risk_level] ?? "var(--text-muted)",
                            fontWeight: 500,
                          }}
                        >
                          {r.risk_level}
                        </span>
                        <span
                          style={{
                            fontFamily:
                              "var(--font-ibm-plex-mono), monospace",
                            fontSize: 9,
                            color: "var(--text-muted)",
                          }}
                        >
                          {r.risk_type?.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p
                        style={{
                          fontFamily:
                            "var(--font-newsreader), Georgia, serif",
                          fontSize: 13,
                          fontStyle: "italic",
                          color: "var(--text-secondary)",
                          margin: "0 0 4px",
                          lineHeight: 1.5,
                        }}
                      >
                        &ldquo;{r.clause_text}&rdquo;
                      </p>
                      <p
                        style={{
                          fontFamily:
                            "var(--font-dm-sans), system-ui, sans-serif",
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          margin: "0 0 2px",
                          lineHeight: 1.5,
                        }}
                      >
                        {r.explanation}
                      </p>
                      <p
                        style={{
                          fontFamily:
                            "var(--font-dm-sans), system-ui, sans-serif",
                          fontSize: 11,
                          color: "var(--navy)",
                          margin: 0,
                        }}
                      >
                        {r.recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Clauses accordion */}
            {clauses.length > 0 && (
              <section
                style={{
                  background: "var(--surface)",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setClausesOpen((o) => !o)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 24px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <h3
                      style={{
                        fontFamily:
                          "var(--font-dm-sans), system-ui, sans-serif",
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        color: "var(--navy)",
                        margin: 0,
                      }}
                    >
                      Clauses
                    </h3>
                    <span
                      style={{
                        fontFamily: "var(--font-ibm-plex-mono), monospace",
                        fontSize: 9,
                        padding: "2px 6px",
                        borderRadius: 100,
                        background: "var(--navy-muted)",
                        color: "var(--navy)",
                      }}
                    >
                      {clauses.length}
                    </span>
                  </div>
                  <ChevronDown
                    size={14}
                    style={{
                      color: "var(--text-muted)",
                      transition: "transform 0.2s",
                      transform: clausesOpen
                        ? "rotate(0deg)"
                        : "rotate(-90deg)",
                    }}
                  />
                </button>
                {clausesOpen && (
                  <div style={{ padding: "0 24px 16px" }}>
                    {clauses.map((c, i) => (
                      <div
                        key={i}
                        className="fade-in-up"
                        style={{
                          animationDelay: `${i * 70}ms`,
                          display: "flex",
                          alignItems: "baseline",
                          gap: 8,
                          padding: "6px 0",
                          borderBottom:
                            i < clauses.length - 1
                              ? "1px solid var(--border)"
                              : "none",
                        }}
                      >
                        <span
                          style={{
                            fontFamily:
                              "var(--font-ibm-plex-mono), monospace",
                            fontSize: 10,
                            color: "var(--text-muted)",
                            minWidth: 28,
                          }}
                        >
                          {c.clause_number}
                        </span>
                        <span
                          style={{
                            fontFamily:
                              "var(--font-dm-sans), system-ui, sans-serif",
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--text-primary)",
                          }}
                        >
                          {c.clause_title}
                        </span>
                        <span
                          style={{
                            fontFamily:
                              "var(--font-ibm-plex-mono), monospace",
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 100,
                            background: "var(--accent-bg)",
                            border: "1px solid var(--accent-border)",
                            color: "var(--accent)",
                            textTransform: "uppercase",
                            flexShrink: 0,
                          }}
                        >
                          {c.clause_type}
                        </span>
                        <span
                          style={{
                            fontFamily:
                              "var(--font-dm-sans), system-ui, sans-serif",
                            fontSize: 11,
                            color: "var(--text-muted)",
                            marginLeft: "auto",
                          }}
                        >
                          {c.summary}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* Analyzing spinner (before analysis arrives) */}
        {!analysis &&
          (status === "analyzing" || status === "uploaded") && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: 40,
              }}
            >
              <Loader2
                size={24}
                className="spinner"
                style={{ color: "var(--navy)" }}
              />
              <span
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: 12,
                  color: "var(--navy)",
                }}
              >
                Analyzing document...
              </span>
            </div>
          )}

        {/* ── SECTION B: Live Verification ────────── */}
        {sources.length > 0 && (
          <section className="fade-in-up">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              {isSearching && <span className="recording-dot" />}
              {!isSearching && (
                <Shield
                  size={12}
                  style={{ color: "var(--success)" }}
                />
              )}
              <span
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "var(--text-muted)",
                }}
              >
                {isSearching
                  ? `Live Verification \u2014 checking against Singapore law`
                  : "Verification Complete"}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  sources.length >= 3
                    ? "1fr 1fr 1fr"
                    : `repeat(${sources.length}, 1fr)`,
                gap: 12,
              }}
            >
              {sources.map((source, i) => (
                <SourcePreviewCard
                  key={source._id}
                  source={source}
                  index={i}
                />
              ))}
            </div>
          </section>
        )}

        {/* Verifying spinner (before sources arrive) */}
        {status === "verifying" && sources.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 24,
            }}
          >
            <Loader2
              size={16}
              className="spinner"
              style={{ color: "var(--navy)" }}
            />
            <span
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: 12,
                color: "var(--navy)",
              }}
            >
              Starting verification...
            </span>
          </div>
        )}

        {/* ── SECTION C: Compliance Report ─────────── */}
        {analysis?.complianceReport && (
          <section
            id="compliance-content"
            className="fade-in-up"
            style={{
              background: "var(--surface)",
              borderRadius: 10,
              border: "1px solid var(--border)",
              padding: "32px 40px",
            }}
          >
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
                Compliance Report
              </span>
              <span
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                {new Date().toLocaleDateString("en-SG", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span style={{ marginLeft: "auto" }}>
                <DownloadPdfButton
                  targetId="compliance-content"
                  filename={`counsel-compliance-${documentId}.pdf`}
                  label="Download PDF"
                />
              </span>
            </div>
            <BriefRenderer content={analysis.complianceReport} />
          </section>
        )}

        {/* ── SECTION D: Suggested Research ────────── */}
        {analysis?.suggestedQueries &&
          analysis.suggestedQueries.length > 0 && (
            <section
              style={{
                background: "var(--surface)",
                borderRadius: 10,
                border: "1px solid var(--border)",
                padding: "20px 24px",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "var(--navy)",
                  margin: "0 0 12px",
                }}
              >
                Further Research
              </h3>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {analysis.suggestedQueries.map((q, i) => (
                  <button
                    key={i}
                    className="counsel-chip"
                    onClick={() => handleSuggestedQuery(q)}
                    disabled={pendingQuery === q}
                    type="button"
                    style={pendingQuery === q ? { borderColor: "var(--navy)", color: "var(--navy)" } : undefined}
                  >
                    {pendingQuery === q && (
                      <Loader2 size={10} className="spinner" style={{ marginRight: 4 }} />
                    )}
                    {pendingQuery === q ? "Starting..." : q}
                  </button>
                ))}
              </div>

              {/* Linked research status */}
              {linkedThread && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "8px 12px",
                    borderRadius: 6,
                    background: "var(--bg-warm)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {linkedThread.status === "complete" ? (
                    <>
                      <span
                        className="pulse-dot pulse-dot-complete"
                      />
                      <span
                        style={{
                          fontFamily: "var(--font-ibm-plex-mono), monospace",
                          fontSize: 11,
                          color: "var(--success)",
                        }}
                      >
                        Research complete — {linkedCompletedSources} sources
                      </span>
                      <a
                        href={`/research/${linkedThreadId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          marginLeft: "auto",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                          fontSize: 11,
                          color: "var(--navy)",
                          textDecoration: "none",
                          fontWeight: 500,
                        }}
                      >
                        View brief <ExternalLink size={10} />
                      </a>
                    </>
                  ) : (
                    <>
                      <Loader2 size={12} className="spinner" style={{ color: "var(--navy)" }} />
                      <span
                        style={{
                          fontFamily: "var(--font-ibm-plex-mono), monospace",
                          fontSize: 11,
                          color: "var(--navy)",
                        }}
                      >
                        Research in progress...
                      </span>
                      <a
                        href={`/research/${linkedThreadId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          marginLeft: "auto",
                          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                          fontSize: 11,
                          color: "var(--text-muted)",
                          textDecoration: "none",
                        }}
                      >
                        Open
                      </a>
                    </>
                  )}
                </div>
              )}
            </section>
          )}
      </main>
    </div>
  );
}
