/**
 * LinkButton - Card-style link matching LauncherCard. Opens URL in default browser on click.
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
      className="flex flex-col rounded-lg border border-zinc-700 bg-zinc-900/80 w-36 shrink-0 hover:border-amber-500/50 transition-colors group text-left cursor-pointer"
      title={link.url}
      aria-label={`Open ${link.label}`}
    >
      <div className="relative aspect-[3/2] bg-zinc-800 flex items-center justify-center overflow-hidden rounded-t-lg p-6">
        {iconSrc ? (
          <img src={iconSrc} alt="" className="w-full h-full object-contain" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-amber-500"
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

      <div className="p-2">
        <h3 className="font-semibold text-white truncate text-sm text-center group-hover:text-amber-500 transition-colors" title={link.label}>
          {link.label}
        </h3>
      </div>
    </button>
  );
}
