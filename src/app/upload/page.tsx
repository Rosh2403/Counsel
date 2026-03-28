"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useDropzone } from "react-dropzone";
import { FileUp, Loader2 } from "lucide-react";
import Link from "next/link";

export default function UploadPage() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const createDocument = useMutation(api.documents.createDocument);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setIsUploading(true);
      setError(null);

      try {
        // 1. Parse PDF server-side
        const formData = new FormData();
        formData.append("file", file);
        const parseRes = await fetch("/api/parse-pdf", {
          method: "POST",
          body: formData,
        });
        if (!parseRes.ok) {
          const err = await parseRes.json();
          throw new Error(err.error || "Failed to parse PDF");
        }
        const { text } = await parseRes.json();

        if (!text || text.trim().length < 50) {
          throw new Error(
            "Could not extract enough text from the PDF. Try a different file.",
          );
        }

        // 2. Create document in Convex
        const documentId = await createDocument({
          fileName: file.name,
          fileType: "pdf",
          textContent: text,
        });

        // 3. Trigger analysis pipeline (fire and forget — SSE)
        fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, textContent: text }),
        }).catch(() => {
          // The API route streams to completion; errors handled there
        });

        // 4. Redirect to analysis dashboard
        router.push(`/upload/${documentId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setIsUploading(false);
      }
    },
    [createDocument, router],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: isUploading,
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        background: `
          radial-gradient(300px circle at 90% 10%, rgba(27, 42, 74, 0.03), transparent),
          var(--bg)
        `,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: 560,
          width: "100%",
          gap: 24,
        }}
      >
        {/* Badge */}
        <span
          style={{
            fontFamily: "var(--font-ibm-plex-mono), monospace",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "2px",
            color: "var(--accent)",
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-border)",
            padding: "4px 12px",
            borderRadius: 100,
          }}
        >
          Document Analysis
        </span>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontSize: 36,
            fontWeight: 400,
            letterSpacing: "-0.03em",
            lineHeight: 1.25,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Analyze your legal{" "}
          <em style={{ color: "var(--navy)" }}>documents</em>
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: 15,
            color: "var(--text-muted)",
            maxWidth: 420,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Upload a contract, agreement, or filing. Our AI analyzes it, then
          verifies it against live Singapore law.
        </p>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          style={{
            width: "100%",
            maxWidth: 520,
            padding: 40,
            borderRadius: 12,
            border: `2px dashed ${isDragActive ? "var(--navy)" : "var(--border-strong)"}`,
            background: isDragActive ? "var(--navy-muted)" : "transparent",
            cursor: isUploading ? "wait" : "pointer",
            transition: "all 0.2s",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <>
              <Loader2
                size={28}
                className="spinner"
                style={{ color: "var(--navy)" }}
              />
              <span
                style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: 14,
                  color: "var(--navy)",
                }}
              >
                Parsing document...
              </span>
            </>
          ) : (
            <>
              <FileUp
                size={28}
                style={{ color: "var(--text-muted)", strokeWidth: 1.5 }}
              />
              <span
                style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: 14,
                  color: "var(--text-primary)",
                }}
              >
                Drop a PDF here
              </span>
              <span
                style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                or click to browse
              </span>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <p
            style={{
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 12,
              color: "var(--error)",
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        {/* Navigation */}
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: 12,
            color: "var(--text-muted)",
            textDecoration: "none",
          }}
        >
          or search a legal question
        </Link>
      </div>
    </div>
  );
}
