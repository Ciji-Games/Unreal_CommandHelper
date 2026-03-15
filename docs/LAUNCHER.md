# Launcher

The Launcher tab is your home base for Unreal Engine projects and engine versions.

## Engine Versions

Displays all installed Unreal Engine versions detected on your system. Each engine appears as a card you can click to launch the Unreal Editor for that version.

## Projects

Lists your added `.uproject` projects. Each project card shows:

- **Project name** and engine version
- **C++ indicator** (if applicable)
- **Available maps**
- **Quick actions** (launch, remove)

| Action | Description |
|--------|-------------|
| **Add Project** | Click the "Add Project" button to browse and add a new `.uproject` file. The app will analyze the project and add it to your list. |
| **Re-scan** | Use the "Re-scan" button to refresh the project list—removing deleted projects and updating map lists. |

## Pinned Jobs

When you pin a job in the Scheduler tab, it appears here for quick access. Pinned jobs let you run common batch workflows (e.g. HLOD pipeline, Cook + Package) directly from the Launcher without switching tabs.

> [!WARNING]
> Jobs are **blocked from running** if Unreal Editor, Visual Studio, or Rider are already running. Close them first to avoid conflicts.
