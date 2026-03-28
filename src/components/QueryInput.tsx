"use client";

import { type FormEvent, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

interface QueryInputProps {
  onSubmit: (query: string) => void;
  isLoading?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

export function QueryInput({ onSubmit, isLoading, value, onChange }: QueryInputProps) {
  const [internal, setInternal] = useState("");
  const query = value ?? internal;
  const setQuery = onChange ?? setInternal;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSubmit(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ position: "relative", width: "100%", maxWidth: 520 }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. What are the penalties for PDPA violations?"
        disabled={isLoading}
        className="counsel-input"
      />
      <button
        type="submit"
        disabled={isLoading || !query.trim()}
        aria-label="Search"
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--navy)",
          border: "none",
          cursor: query.trim() && !isLoading ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: query.trim() ? 1 : 0.4,
          transition: "opacity 0.2s, background 0.2s",
        }}
        onMouseEnter={(e) => {
          if (query.trim()) (e.currentTarget.style.background = "var(--navy-light)");
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--navy)";
        }}
      >
        {isLoading ? (
          <Loader2 size={16} color="white" className="spinner" />
        ) : (
          <ArrowRight size={16} color="white" />
        )}
      </button>
    </form>
  );
}
