/**
 * Asset paths for Phase B — icons and images from UECommandHelper.
 * Refresh and trash icons use a web lib (e.g. Lucide, Heroicons).
 * App icon and link icon live in src-tauri/icons.
 */

// Import as URLs (Vite handles these at build time)
import cppLogo from '../assets/ISO_C++_Logo.svg.png';
import ueIcon from '../assets/UE-Icon-2023-White.png';

export const ASSETS = {
  /** C++ badge on project cards */
  cppLogo,
  /** Default project/engine thumbnail and link button fallback */
  ueIcon,
} as const;
