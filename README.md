# UE Launcher

Unreal Engine project launcher and toolbox for Windows. Launch projects, run common workflows, and schedule batch jobs.

## Screenshots

| Launcher | Shader Booster |
|----------|----------------|
| ![Launcher](public/assets/launcher.png) | ![Shader Booster](public/assets/shaderbooster.png) |
| Batch Job | Map Helper |
| ![Batch Job](public/assets/batchJob.png) | ![Map Helper](public/assets/MapHelper.png) |

## Features

- **Launcher**: Browse installed Unreal Engine versions and manage your projects (.uproject)
- **ToolBox**: Shader Booster, Regenerate Project, Batch Commit, UMap Helper, Plugin Helper, UProject Helper
- **Scheduler**: Create named batch jobs (sequences of tools) and run them in order
- **Links**: Quick links and resources

## Requirements

- **Windows 11** (64-bit)

No other prerequisites. The app runs standalone on Windows 11 (WebView2 is pre-installed).

**Optional** (for specific features):
- **Unreal Engine** — Launcher, Regenerate, Cook, Package, Build Lighting, UMap, Plugin build
- **Git** — Batch Commit
- **Git LFS** — Batch Commit (large files)

## Download

1. Go to the [Releases](https://github.com/cguillaume44/Unreal_CommandHelper/releases) page
2. Download the latest `.msi` installer (or `-setup.exe` if available)
3. Run the installer

## Installation

Run the downloaded installer. The app will be installed to your chosen location. No additional prerequisites needed on Windows 11.

## Build from Source

For developers who want to build from source:

**Prerequisites**: Node.js (LTS), Rust, npm

```bash
git clone https://github.com/cguillaume44/Unreal_CommandHelper.git
cd Unreal_CommandHelper
npm install
npm run tauri build
```

Build output: `Build/release/bundle/msi/` (or `target/release/bundle/` depending on CARGO_TARGET_DIR).

## License

MIT
