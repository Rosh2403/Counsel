"use client";

import { useState, useCallback } from "react";
import { Clipboard, Check } from "lucide-react";

interface CopyBriefButtonProps {
  markdown: string;
}

export function CopyBriefButton({ markdown }: CopyBriefButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = markdown;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [markdown]);

  return (
    <button
      onClick={handleCopy}
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
          Copied!
        </>
      ) : (
        <>
          <Clipboard size={12} />
          Copy Brief
        </>
      )}
    </button>
  );
}
