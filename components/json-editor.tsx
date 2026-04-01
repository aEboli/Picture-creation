"use client";

import type { ChangeEvent } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  error?: string | null;
  helper?: string;
  onFormat?: () => void;
  formatLabel?: string;
};

export function JsonEditor({
  label,
  value,
  onChange,
  rows = 12,
  placeholder,
  error,
  helper,
  onFormat,
  formatLabel = "Format",
}: Props) {
  return (
    <label>
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
      />
      {onFormat ? (
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={onFormat}>
            {formatLabel}
          </button>
        </div>
      ) : null}
      {error ? <small className="helper error-text">{error}</small> : null}
      {!error && helper ? <small className="helper">{helper}</small> : null}
    </label>
  );
}

