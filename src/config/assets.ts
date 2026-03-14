/**
 * Asset paths for Phase B — icons and images from UECommandHelper.
 * Refresh and trash icons use a web lib (e.g. Lucide, Heroicons).
 * App icon and link icon live in src-tauri/icons.
 */

// Import as URLs (Vite handles these at build time)
import cppLogo from '../assets/ISO_C++_Logo.svg.png';
import ueIcon from '../assets/UE-Icon-2023-White.png';
import fab from '../assets/fab.png';
import logoBackend from '../assets/Logo_backend.png';
import logoAcademy from '../assets/Logo_academy.png';
import discord from '../assets/discord.png';
import iconCPPGen from '../assets/IconCPPGen.png';
import iconLDA from '../assets/IconLDA.png';

export const ASSETS = {
  /** C++ badge on project cards */
  cppLogo,
  /** Default project/engine thumbnail and link button fallback */
  ueIcon,
  /** Fab.com icon */
  fab,
  /** Ciji Games backend logo */
  logoBackend,
  /** Ciji Games academy logo */
  logoAcademy,
  /** Discord icon */
  discord,
  /** C++ Generator icon */
  iconCPPGen,
  /** LD Assistant 2 icon */
  iconLDA,
} as const;
