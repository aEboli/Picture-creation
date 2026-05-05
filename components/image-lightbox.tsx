"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export type ImageLightboxItem = {
  alt: string;
  label?: string;
  src: string;
};

type ImageLightboxProps = {
  actionHref?: string | null;
  actionLabel?: string;
  canNext?: boolean;
  canPrev?: boolean;
  closeLabel?: string;
  currentIndex: number;
  items: ImageLightboxItem[];
  nextLabel?: string;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  previousLabel?: string;
};

function LightboxArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path
        d={direction === "left" ? "M11.75 4.5 6.25 10l5.5 5.5" : "M8.25 4.5 13.75 10l-5.5 5.5"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function ImageLightbox({
  actionHref,
  actionLabel,
  canNext = false,
  canPrev = false,
  closeLabel = "Close preview",
  currentIndex,
  items,
  nextLabel = "Next image",
  onClose,
  onNext,
  onPrev,
  previousLabel = "Previous image",
}: ImageLightboxProps) {
  const currentItem = currentIndex >= 0 ? items[currentIndex] ?? null : null;

  useEffect(() => {
    if (!currentItem) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" && canPrev && onPrev) {
        event.preventDefault();
        onPrev();
        return;
      }

      if (event.key === "ArrowRight" && canNext && onNext) {
        event.preventDefault();
        onNext();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canNext, canPrev, currentItem, onClose, onNext, onPrev]);

  if (!currentItem || typeof document === "undefined") {
    return null;
  }

  const isInternalAction = Boolean(actionHref?.startsWith("/"));

  return createPortal(
    <div
      aria-label={currentItem.label ?? currentItem.alt}
      aria-modal="true"
      className="image-lightbox"
      onClick={onClose}
      role="dialog"
    >
      <div className="image-lightbox-surface" onClick={(event) => event.stopPropagation()}>
        <button
          aria-label={closeLabel}
          className="image-lightbox-close ghost-button"
          onClick={onClose}
          type="button"
        >
          x
        </button>

        <div className="image-lightbox-stage">
          <button
            aria-label={previousLabel}
            className="image-lightbox-nav image-lightbox-nav-prev ghost-button"
            disabled={!canPrev}
            onClick={onPrev}
            type="button"
          >
            <LightboxArrowIcon direction="left" />
          </button>

          <img alt={currentItem.alt} className="image-lightbox-image" decoding="async" src={currentItem.src} />

          <button
            aria-label={nextLabel}
            className="image-lightbox-nav image-lightbox-nav-next ghost-button"
            disabled={!canNext}
            onClick={onNext}
            type="button"
          >
            <LightboxArrowIcon direction="right" />
          </button>
        </div>

        {actionHref && actionLabel ? (
          <div className="image-lightbox-footer">
            <a
              className="ghost-button image-lightbox-action"
              href={actionHref}
              rel={isInternalAction ? undefined : "noreferrer"}
              target={isInternalAction ? undefined : "_blank"}
            >
              {actionLabel}
            </a>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
