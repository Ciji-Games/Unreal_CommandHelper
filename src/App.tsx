import { useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { BaseLayout } from './components/BaseLayout';
import { LauncherTab } from './components/LauncherTab';
import { ToolBoxTab } from './components/ToolBoxTab';
import { SchedulerTab } from './components/SchedulerTab';
import { LinksTab } from './components/LinksTab';
import { ShaderBoosterBackground } from './components/ShaderBoosterBackground';
import { LogProvider } from './contexts/LogContext';
import { ProgressProvider } from './contexts/ProgressContext';
import { ProjectsProvider } from './contexts/ProjectsContext';
import { EnginesProvider } from './contexts/EnginesContext';

const TAB_ICONS = {
  launcher: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  ),
  toolbox: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.25L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
    </svg>
  ),
  scheduler: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
  links: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  ),
} as const;

const TABS = [
  { id: 'launcher' as const, label: 'Launcher' },
  { id: 'toolbox' as const, label: 'ToolBox' },
  { id: 'scheduler' as const, label: 'Scheduler' },
  { id: 'links' as const, label: 'Links' },
] as const;

function App() {
  const [activeTab, setActiveTab] = useState<'launcher' | 'toolbox' | 'scheduler' | 'links'>('launcher');

  return (
    <ProjectsProvider>
      <EnginesProvider>
      <LogProvider>
        <ProgressProvider>
          <ShaderBoosterBackground />
          <BaseLayout>
            <div className="flex flex-col gap-6 min-h-0 flex-1">
              {/* Tab navigation - horizontal, full width, with icons */}
              <nav className="flex gap-1 border-b border-slate-700/80 pb-0 shrink-0 items-center">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex items-center gap-2.5 px-5 py-4 text-sm font-medium rounded-t ${
                      activeTab === tab.id
                        ? 'bg-slate-800/80 text-sky-400 border-b-2 border-sky-400 -mb-px'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <span className={activeTab === tab.id ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-400'}>{TAB_ICONS[tab.id]}</span>
                    {tab.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await openUrl('https://github.com/Ciji-Games/Unreal_CommandHelper');
                    } catch (e) {
                      console.error('Failed to open documentation:', e);
                    }
                  }}
                  className="ml-auto p-2 rounded text-slate-500 hover:text-sky-400 hover:bg-slate-800/40 transition-colors"
                  title="Open documentation"
                  aria-label="Open documentation"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </button>
              </nav>

              {/* Tab content - overflow-visible so dropdowns can overflow in all tabs */}
              <div className="flex min-h-0 flex-1 flex-col overflow-visible">
                {activeTab === 'launcher' && <LauncherTab />}
                {activeTab === 'toolbox' && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <ToolBoxTab />
                  </div>
                )}
                {activeTab === 'scheduler' && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <SchedulerTab />
                  </div>
                )}
                {activeTab === 'links' && <LinksTab />}
              </div>
            </div>
          </BaseLayout>
        </ProgressProvider>
      </LogProvider>
      </EnginesProvider>
    </ProjectsProvider>
  );
}

export default App;
