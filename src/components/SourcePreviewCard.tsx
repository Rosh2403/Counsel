"use client";

import { useEffect, useRef } from "react";
import { ExternalLink, Check, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import type { Source } from "@/lib/types";
import { SOURCE_META } from "@/lib/types";

interface SourcePreviewCardProps {
  source: Source;
  index: number;
  onRetry?: () => void;
}

export function SourcePreviewCard({ source, index, onRetry }: SourcePreviewCardProps) {
  const meta = SOURCE_META[source.type];
  const cardRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef(source.status);

  // Status transition flash — DOM manipulation avoids setState-in-effect
  useEffect(() => {
    if (prevStatus.current !== source.status) {
      prevStatus.current = source.status;
      const el = cardRef.current;
      if (el) {
        el.classList.add("status-flash");
        const t = setTimeout(() => el.classList.remove("status-flash"), 600);
        return () => clearTimeout(t);
      }
    }
  }, [source.status]);

  const steps = source.progressSteps ?? [];
  const lastSteps = steps.slice(-3);

  const badgeClass = `source-badge source-badge-${source.type}`;

  return (
    <div
      ref={cardRef}
      className="fade-in-up"
      style={{
        animationDelay: `${index * 80}ms`,
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      {/* Fake browser chrome */}
      <div className="browser-chrome">
        <div className="browser-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </div>
        <div className="browser-url-bar">
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{source.url}</span>
          <ExternalLink size={8} style={{ flexShrink: 0, opacity: 0.5 }} />
        </div>
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {meta.name}
        </span>
        <span className={badgeClass}>{meta.label}</span>
      </div>

      {/* Content area */}
      <div style={{ position: "relative", height: 200, background: "#0a0a0a" }}>
        {source.status === "pending" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontFamily: "var(--font-ibm-plex-mono), monospace",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            Queued...
          </div>
        )}

        {source.status === "searching" && source.streamingUrl && (
          <iframe
            src={source.streamingUrl}
            sandbox="allow-same-origin allow-scripts"
            title={`${meta.name} browser`}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              borderRadius: 0,
            }}
          />
        )}

        {source.status === "searching" && !source.streamingUrl && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 8,
              fontFamily: "var(--font-ibm-plex-mono), monospace",
              fontSize: 11,
              color: "var(--navy)",
            }}
          >
            <Loader2 size={14} className="spinner" />
            Connecting...
          </div>
        )}

        {source.status === "complete" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 8,
              background: "var(--surface)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--success-bg)",
                border: "1.5px solid var(--success)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={16} color="var(--success)" />
            </div>
            <span
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: 11,
                color: "var(--success)",
              }}
            >
              {(() => {
                const r = source.results as Record<string, unknown> | undefined;
                if (!r) return 0;
                const arr = r.statutes ?? r.regulations ?? r.cases;
                return Array.isArray(arr) ? arr.length : 0;
              })()} results extracted
            </span>
          </div>
        )}

        {source.status === "error" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 10,
              background: "var(--surface)",
              padding: "16px",
            }}
          >
            <AlertTriangle size={20} style={{ color: "var(--error)" }} />
            <span
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: 10,
                color: "var(--error)",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {source.error?.kind?.replace(/_/g, " ") ?? "Search failed"}
            </span>
            <span
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 11,
                color: "var(--text-muted)",
                textAlign: "center",
                lineHeight: 1.4,
              }}
            >
              {source.error?.helpMessage ?? `Failed after ${source.retryCount} attempts`}
            </span>
            {onRetry && (
              <button
                onClick={onRetry}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border-strong)",
                  background: "var(--surface)",
                  color: "var(--navy)",
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--navy)";
                  e.currentTarget.style.color = "white";
                  e.currentTarget.style.borderColor = "var(--navy)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--surface)";
                  e.currentTarget.style.color = "var(--navy)";
                  e.currentTarget.style.borderColor = "var(--border-strong)";
                }}
              >
                <RefreshCw size={10} />
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mini activity log */}
      {lastSteps.length > 0 && (
        <div style={{ padding: "6px 12px", borderTop: "1px solid var(--border)" }}>
          {lastSteps.map((step, i) => {
            const isActive = i === lastSteps.length - 1 && source.status === "searching";
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 0",
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: 9,
                  color: isActive ? "var(--navy)" : "var(--text-muted)",
                }}
              >
                {isActive ? (
                  <Loader2 size={8} className="spinner" style={{ flexShrink: 0 }} />
                ) : (
                  <Check size={8} style={{ flexShrink: 0, opacity: 0.6, color: "var(--success)" }} />
                )}
                <span className={isActive ? "cursor-blink" : ""}>{step.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
