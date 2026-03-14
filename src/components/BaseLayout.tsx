import type { ReactNode } from 'react';

interface BaseLayoutProps {
  children: ReactNode;
}

export function BaseLayout({ children }: BaseLayoutProps) {
  return (
    <div className="min-h-screen h-full flex flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      <main className="flex-1 min-h-0 flex flex-col px-6 !pt-0 pb-2">{children}</main>
      {/* Subtle accent bar */}
      <div className="h-1.5 shrink-0 bg-gradient-to-r from-sky-500/80 via-sky-400/60 to-transparent" />
    </div>
  );
}
