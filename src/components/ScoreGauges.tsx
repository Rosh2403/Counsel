"use client";

interface GaugeProps {
  label: string;
  score: number; // 0–100
}

function getColor(score: number): string {
  if (score >= 90) return "var(--success)";
  if (score >= 50) return "var(--accent)";
  return "var(--error)";
}

const RADIUS = 28;
const STROKE = 4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = (RADIUS + STROKE) * 2;

function Gauge({ label, score }: GaugeProps) {
  const offset = CIRCUMFERENCE * (1 - score / 100);
  const color = getColor(score);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="gauge-circle"
      >
        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth={STROKE}
        />
        {/* Fill */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="gauge-fill"
          style={{
            ["--gauge-circumference" as string]: CIRCUMFERENCE,
            ["--gauge-offset" as string]: offset,
          }}
        />
      </svg>
      <div
        style={{
          position: "relative",
          marginTop: -SIZE / 2 - 8,
          fontFamily: "var(--font-ibm-plex-mono), monospace",
          fontSize: 14,
          fontWeight: 500,
          color: color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {score}
      </div>
      <div
        style={{
          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
          fontSize: 10,
          fontWeight: 500,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

interface ScoreGaugesProps {
  relevance: number;
  coverage: number;
  currency: number;
}

export function ScoreGauges({ relevance, coverage, currency }: ScoreGaugesProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 40,
        padding: "20px 0",
      }}
    >
      <Gauge label="Relevance" score={relevance} />
      <Gauge label="Coverage" score={coverage} />
      <Gauge label="Currency" score={currency} />
    </div>
  );
}
