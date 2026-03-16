/**
 * Custom Select - matches LauncherCard dropdown styling (dark theme, consistent look).
 * Replaces native <select> for uniform appearance across the app.
 * Dropdown is portaled to body so it can overflow scrollable containers (e.g. job editor).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const DROPDOWN_BASE =
  'fixed z-[9999] rounded-md border border-slate-600/80 bg-[var(--color-bg-card)] shadow-xl max-h-32 overflow-y-auto';
const DROPDOWN_MAX_HEIGHT = 128; // max-h-32 = 8rem
const OPTION_STYLE =
  'w-full px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-700/80 hover:text-slate-100 truncate';
const TRIGGER_STYLE =
  'w-full rounded-md bg-slate-700/50 border border-slate-600 text-slate-100 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30 disabled:opacity-50 flex items-center justify-between gap-2 text-left';

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className = '',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const updatePosition = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 4;
      const openAbove = spaceBelow < DROPDOWN_MAX_HEIGHT;
      setDropdownRect({
        top: openAbove ? rect.top - 4 - DROPDOWN_MAX_HEIGHT : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    updatePosition();
    const onScroll = (e: Event) => {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  const dropdownEl =
    open && dropdownRect ? (
      <div
        ref={dropdownRef}
        className={DROPDOWN_BASE}
        style={{
          top: dropdownRect.top,
          left: dropdownRect.left,
          width: dropdownRect.width,
        }}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
            className={`${OPTION_STYLE} ${opt.value === value ? 'bg-slate-700/60 text-slate-100' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`${TRIGGER_STYLE} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 shrink-0 text-slate-400 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdownEl && createPortal(dropdownEl, document.body)}
    </div>
  );
}
