"use client";

import { useState } from "react";

/**
 * A card whose front (chart / KPI) flips to a plain-English explanation of how
 * the number was calculated. `how` is an array of short lines (or a function
 * returning one) — when it is missing the card renders as a plain card.
 */
export default function FlipCard({
  children,
  how,
  item,
  className = "",
  label = "How it's calculated",
}) {
  const [flipped, setFlipped] = useState(false);

  const lines = typeof how === "function" ? how(item) : how;
  const flippable = Array.isArray(lines) && lines.length > 0;

  if (!flippable) {
    return <div className={`p-5 ${className}`}>{children}</div>;
  }

  const toggle = () => setFlipped((value) => !value);

  return (
    <div
      onClick={toggle}
      className={`relative cursor-pointer p-5 ${className}`}
    >
      <div className={flipped ? "invisible" : "visible"}>
        {children}
        <div className="mt-4 flex justify-end">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
            {label} →
          </span>
        </div>
      </div>

      <div
        className={`absolute inset-0 z-10 overflow-y-auto rounded-[inherit] bg-white p-5 transition-opacity duration-200 ${
          flipped ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
              {label}
            </p>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400">
              Back
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {lines.map((line, index) => (
              <li
                key={index}
                className="flex gap-2 text-sm leading-6 text-slate-600"
              >
                <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-blue-500" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
