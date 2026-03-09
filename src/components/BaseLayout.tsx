import type { ReactNode } from 'react';

interface BaseLayoutProps {
  children: ReactNode;
}

export function BaseLayout({ children }: BaseLayoutProps) {
  return (
    <div className="min-h-screen h-full flex flex-col bg-zinc-950 text-zinc-100">
      {/* Accent bar */}
      <div className="h-1 shrink-0 bg-[#DDA209]" />
      <main className="flex-1 min-h-0 flex flex-col p-6">{children}</main>
    </div>
  );
}
