import { useState } from 'react';
import { BaseLayout } from './components/BaseLayout';
import { LauncherTab } from './components/LauncherTab';
import { ToolBoxTab } from './components/ToolBoxTab';
import { LogProvider } from './contexts/LogContext';

function App() {
  const [activeTab, setActiveTab] = useState<'launcher' | 'toolbox'>('launcher');

  return (
    <LogProvider>
      <BaseLayout>
        <div className="space-y-6">
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
          {activeTab === 'toolbox' && <ToolBoxTab />}
        </div>
      </BaseLayout>
    </LogProvider>
  );
}

export default App;
