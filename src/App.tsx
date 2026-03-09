import { useState } from 'react';
import { BaseLayout } from './components/BaseLayout';
import { LauncherTab } from './components/LauncherTab';
import { ToolBoxTab } from './components/ToolBoxTab';
import { ShaderBoosterBackground } from './components/ShaderBoosterBackground';
import { LogProvider } from './contexts/LogContext';

function App() {
  const [activeTab, setActiveTab] = useState<'launcher' | 'toolbox'>('launcher');

  return (
    <LogProvider>
      <ShaderBoosterBackground />
      <BaseLayout>
        <div className="flex flex-col gap-6 min-h-0 flex-1">
          {/* Tab navigation */}
          <div className="flex gap-2 border-b border-zinc-800 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('launcher')}
              className={`px-4 py-2 rounded-t font-medium transition-colors ${
                activeTab === 'launcher'
                  ? 'bg-zinc-800 text-amber-500 border-b-2 border-amber-500'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              Launcher
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('toolbox')}
              className={`px-4 py-2 rounded-t font-medium transition-colors ${
                activeTab === 'toolbox'
                  ? 'bg-zinc-800 text-amber-500 border-b-2 border-amber-500'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              ToolBox
            </button>
          </div>

          {activeTab === 'launcher' && <LauncherTab />}
          {activeTab === 'toolbox' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <ToolBoxTab />
            </div>
          )}
        </div>
      </BaseLayout>
    </LogProvider>
  );
}

export default App;
