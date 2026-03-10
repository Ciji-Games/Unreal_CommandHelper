/**
 * LinkButton - Icon + label, opens URL in default browser on click.
 * Mirrors URLBtn from UECommandHelper.
 */

import { openUrl } from '@tauri-apps/plugin-opener';
import { ASSETS } from '../config/assets';
import type { LinkEntry } from '../config';

interface LinkButtonProps {
  link: LinkEntry;
}

export function LinkButton({ link }: LinkButtonProps) {
  const handleClick = async () => {
    try {
      await openUrl(link.url);
    } catch (e) {
      console.error('Failed to open link:', e);
    }
  };

  const iconSrc = link.icon ? ASSETS[link.icon] : undefined;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex flex-col items-center justify-center gap-3 p-5 rounded-lg border border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 hover:border-amber-500/50 transition-colors w-36 h-36 shrink-0 group"
      title={link.url}
      aria-label={`Open ${link.label}`}
    >
      <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-zinc-800 group-hover:bg-zinc-700 transition-colors overflow-hidden">
        {iconSrc ? (
          <img src={iconSrc} alt="" className="w-10 h-10 object-contain" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        )}
      </div>
      <span className="text-sm font-medium text-white text-center line-clamp-2 group-hover:text-amber-500 transition-colors">
        {link.label}
      </span>
    </button>
  );
}
