"use client";

import type { CSSProperties } from "react";

import { motion } from "framer-motion";

import { AnimatedCounter } from "@/components/animated-counter";

export function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const numValue = parseInt(value.replace(/,/g, ""), 10);
  const isNumeric = !isNaN(numValue);

  return (
    <motion.article
      className="stat-card"
      style={accent ? ({ "--stat-accent": accent } as CSSProperties) : undefined}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <div className="stat-card-glow" />
      <div className="stat-card-head">
        <span className="stat-card-label">{label}</span>
        <i aria-hidden className="stat-card-dot" />
      </div>
      <strong className="stat-card-value">
        {isNumeric ? <AnimatedCounter value={numValue} /> : value}
      </strong>
    </motion.article>
  );
}
