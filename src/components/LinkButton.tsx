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
  const fullThumb = link.fullThumbnail && iconSrc;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex flex-col rounded-lg border border-slate-600/60 bg-slate-800/50 w-28 shrink-0 hover:border-sky-500/40 transition-all group text-left cursor-pointer shadow-sm"
      title={link.url}
      aria-label={`Open ${link.label}`}
    >
      <div
        className={`relative aspect-square bg-slate-700/50 flex items-center justify-center overflow-hidden rounded-t-lg ${fullThumb ? 'p-0' : 'p-6'}`}
      >
        {iconSrc ? (
          <img
            src={iconSrc}
            alt=""
            className={fullThumb ? 'w-full h-full object-contain' : 'w-full h-full object-contain'}
          />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-sky-400/80"
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

      <div className="p-2.5">
        <h3 className="font-medium text-slate-100 text-xs text-center group-hover:text-sky-400 transition-colors break-words" title={link.label}>
          {link.label}
        </h3>
      </div>
    </button>
  );
}
