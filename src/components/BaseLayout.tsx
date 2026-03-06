import type { ReactNode } from 'react';

interface BaseLayoutProps {
  children: ReactNode;
}

export function BaseLayout({ children }: BaseLayoutProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Accent bar */}
      <div className="h-1 bg-[#DDA209]" />
      <main className="p-6">{children}</main>
    </div>
  );
}
