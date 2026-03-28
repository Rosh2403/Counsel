"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { QueryInput } from "@/components/QueryInput";

const SUGGESTIONS = [
  "MAS crypto regulations",
  "Employment Act termination",
  "PDPA data protection",
];

export default function LandingPage() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const startResearch = useMutation(api.research.startResearch);

  const handleSubmit = async (q: string) => {
    setIsLoading(true);
    try {
      const threadId = await startResearch({ query: q });
      router.push(`/research/${threadId}`);
    } catch {
      setIsLoading(false);
    }
  };

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
          AI-Powered Legal Research
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
          Research Singapore law in{" "}
          <em style={{ color: "var(--navy)" }}>seconds</em>, not hours
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
          Ask a legal question. Our agent searches statutes, regulations, and case law
          autonomously — then synthesises a cited brief.
        </p>

        {/* Search input */}
        <QueryInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />

        {/* Chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="counsel-chip"
              onClick={() => setQuery(s)}
              type="button"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
