# UE Launcher — Assets Index

Refresh and trash icons use a web lib (e.g. Lucide, Heroicons).

## src/assets (frontend)

| File | Phase B Usage |
|------|---------------|
| `ISO_C++_Logo.svg.png` | C++ indicator on project cards |
| `UE-Icon-2023-White.png` | Default project/engine thumbnail; link button fallback |

## src-tauri/icons (app bundle)

App icon (`SimpleLogo_Bkg_Round-small`) — `icon.ico`, `32x32.png`, `128x128.png`, etc.

## Import (Vite/React)

```ts
import { ASSETS } from './config/assets';
// ASSETS.cppLogo, ASSETS.ueIcon
```

## Notes

- **Project thumbnails**: Use `{projectPath}.png` or `Saved/AutoScreenshot.png` at runtime; `ueIcon` as fallback.
- **Links tab**: Use `ueIcon` or web lib icon; config can override per-URL.
