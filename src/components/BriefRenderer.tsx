"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface BriefRendererProps {
  content: string;
}

export function BriefRenderer({ content }: BriefRendererProps) {
  return (
    <div className="brief-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
