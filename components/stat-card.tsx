import type { CSSProperties } from "react";

export function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <article className="stat-card" style={accent ? ({ "--stat-accent": accent } as CSSProperties) : undefined}>
      <div className="stat-card-head">
        <span className="stat-card-label">{label}</span>
        <i aria-hidden className="stat-card-dot" />
      </div>
      <strong className="stat-card-value">{value}</strong>
    </article>
  );
}
