"use client";

import { useState, useCallback } from "react";
import { Download, Loader2 } from "lucide-react";

interface DownloadPdfButtonProps {
  targetId: string;
  filename: string;
  label?: string;
}

export function DownloadPdfButton({
  targetId,
  filename,
  label = "Download PDF",
}: DownloadPdfButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = useCallback(async () => {
    const element = document.getElementById(targetId);
    if (!element) return;

    setGenerating(true);
    element.classList.add("pdf-generating");

    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [20, 20, 20, 20],
          filename,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
        })
        .from(element)
        .save();
    } catch {
      // ignore — pdf generation is best-effort
    } finally {
      element.classList.remove("pdf-generating");
      setGenerating(false);
    }
  }, [targetId, filename]);

  return (
    <button
      onClick={handleDownload}
      disabled={generating}
      className="no-pdf"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: generating ? "var(--navy)" : "var(--text-muted)",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        fontSize: 11,
        fontWeight: 500,
        cursor: generating ? "wait" : "pointer",
        transition: "all 0.2s ease",
      }}
    >
      {generating ? (
        <>
          <Loader2 size={12} className="spinner" />
          Generating...
        </>
      ) : (
        <>
          <Download size={12} />
          {label}
        </>
      )}
    </button>
  );
}
