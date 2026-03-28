"use client";

import { useState, useMemo } from "react";
import { ChevronDown, Loader2, Check } from "lucide-react";
import type { Source, SourceType } from "@/lib/types";
import { SOURCE_META, formatElapsed } from "@/lib/types";

interface ActivityLogProps {
  sources: Source[];
  threadCreatedAt: number;
  isSearching: boolean;
}

interface MergedStep {
  text: string;
  timestamp: number;
  sourceType: SourceType;
}

export function ActivityLog({ sources, threadCreatedAt, isSearching }: ActivityLogProps) {
  const [collapsed, setCollapsed] = useState(false);

  const steps = useMemo(() => {
    const merged: MergedStep[] = [];
    for (const src of sources) {
      if (!src.progressSteps) continue;
      for (const step of src.progressSteps) {
        merged.push({
          text: step.text,
          timestamp: step.timestamp,
          sourceType: src.type,
        });
      }
    }
    return merged.sort((a, b) => a.timestamp - b.timestamp);
  }, [sources]);

  const autoCollapsed = !isSearching && steps.length > 0;
  const isOpen = !collapsed && !autoCollapsed;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            Activity Log
          </span>
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
            {steps.length}
          </span>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: "var(--text-muted)",
            transition: "transform 0.2s",
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        />
      </button>

      {/* Steps */}
      <div
        className="accordion-content"
        style={{
          maxHeight: isOpen ? `${steps.length * 28 + 48}px` : 0,
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div style={{ padding: "0 16px 8px" }}>
          {steps.map((step, i) => {
            const isActive = i === steps.length - 1 && isSearching;
            const elapsed = step.timestamp - threadCreatedAt;
            return (
              <div
                key={i}
                className="fade-in-up"
                style={{
                  animationDelay: `${i * 70}ms`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "4px 0",
                }}
              >
                {/* Elapsed time */}
                <span
                  style={{
                    fontFamily: "var(--font-ibm-plex-mono), monospace",
                    fontSize: 9,
                    color: "var(--text-muted)",
                    opacity: 0.6,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 36,
                    textAlign: "right",
                  }}
                >
                  {formatElapsed(elapsed)}
                </span>

                {/* Source badge */}
                <span className={`source-badge source-badge-${step.sourceType}`}>
                  {SOURCE_META[step.sourceType].label}
                </span>

                {/* Icon */}
                {isActive ? (
                  <Loader2
                    size={10}
                    className="spinner"
                    style={{ color: "var(--navy)", flexShrink: 0 }}
                  />
                ) : (
                  <Check
                    size={10}
                    style={{ color: "var(--success)", opacity: 0.6, flexShrink: 0 }}
                  />
                )}

                {/* Text */}
                <span
                  className={isActive ? "cursor-blink" : ""}
                  style={{
                    fontFamily: "var(--font-ibm-plex-mono), monospace",
                    fontSize: 11,
                    color: isActive ? "var(--navy)" : "var(--text-secondary)",
                  }}
                >
                  {step.text}
                </span>
              </div>
            );
          })}
        </div>

        {/* Running footer */}
        {isSearching && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              background: "rgba(27, 42, 74, 0.05)",
              borderTop: "1px solid var(--border)",
            }}
          >
            <span className="pulse-dot" />
            <span
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: 10,
                color: "var(--navy)",
              }}
            >
              Agent working...
            </span>
            <span
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: 9,
                color: "var(--text-muted)",
                marginLeft: "auto",
              }}
            >
              {steps.length} steps
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
