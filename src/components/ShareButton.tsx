"use client";

import { useState, useCallback } from "react";
import { Share2, Check } from "lucide-react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, []);

  return (
    <button
      onClick={handleShare}
      className="no-pdf"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: 6,
        border: `1px solid ${copied ? "var(--success)" : "var(--border)"}`,
        background: copied ? "var(--success-bg)" : "var(--surface)",
        color: copied ? "var(--success)" : "var(--text-muted)",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        fontSize: 11,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      {copied ? (
        <>
          <Check size={12} />
          Link copied!
        </>
      ) : (
        <>
          <Share2 size={12} />
          Share
        </>
      )}
    </button>
  );
}
