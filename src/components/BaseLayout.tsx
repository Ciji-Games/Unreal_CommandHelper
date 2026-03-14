import type { ReactNode } from 'react';

interface BaseLayoutProps {
  children: ReactNode;
}

export function BaseLayout({ children }: BaseLayoutProps) {
  return (
    <div className="min-h-screen h-full flex flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      <main className="flex-1 min-h-0 flex flex-col px-6 !pt-0 pb-2">{children}</main>
      {/* Subtle accent bar - fixed to viewport so it stays at bottom when scrollbar appears */}
      <div className="fixed bottom-0 left-0 right-0 h-1.5 z-10 bg-gradient-to-r from-sky-500/80 via-sky-400/60 to-transparent pointer-events-none" />
    </div>
  );
}
