"use client";

import { useCallback, useEffect, useState } from "react";

const HEADER_OFFSET_DESKTOP = 28;
const HEADER_OFFSET_MOBILE = 68;

export default function SectionNav({ brand, sections }) {
  const [active, setActive] = useState(sections[0]?.id || "");
  const [items, setItems] = useState(sections);

  useEffect(() => {
    const available = sections.filter((s) => document.getElementById(s.id));
    setItems(available.length > 0 ? available : sections);
    setActive((current) =>
      available.some((s) => s.id === current) || !available.length
        ? current
        : available[0].id
    );
  }, [sections]);

  useEffect(() => {
    let frame = null;

    const measure = () => {
      frame = null;
      const list = items.length ? items : sections;
      const marker = window.innerHeight * 0.28;
      let current = list[0]?.id || "";

      for (const section of list) {
        const el = document.getElementById(section.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= marker) current = section.id;
      }

      const atBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 4;
      if (atBottom) current = list[list.length - 1].id;

      setActive(current);
    };

    const onScroll = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [items, sections]);

  const goTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const offset =
      window.innerWidth >= 1024 ? HEADER_OFFSET_DESKTOP : HEADER_OFFSET_MOBILE;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    setActive(id);
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-sm font-bold text-white shadow-sm">
            {brand.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-slate-900">
              {brand.title}
            </p>
            <p className="truncate text-[11px] leading-tight text-slate-400">
              {brand.subtitle}
            </p>
          </div>
        </div>

        <p className="mt-9 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Sections
        </p>

        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto">
          {items.map((section, index) => {
            const isActive = active === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => goTo(section.id)}
                aria-current={isActive ? "true" : undefined}
                className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-blue-50 font-semibold text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="truncate">{section.label}</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-slate-100 px-2.5 pt-4">
          <p className="text-[11px] leading-5 text-slate-400">
            {brand.footer}
          </p>
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <nav className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/90 backdrop-blur lg:hidden">
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 text-[11px] font-bold text-white">
            {brand.initials}
          </div>
          {items.map((section, index) => {
            const isActive = active === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => goTo(section.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                <span className="mr-1.5 opacity-60">{index + 1}</span>
                {section.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
