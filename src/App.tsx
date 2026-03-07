import { BaseLayout } from './components/BaseLayout';
import { StatusPanel } from './components/StatusPanel';

function App() {
  return (
    <BaseLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">UE Launcher</h1>
        <p className="text-zinc-400">
          Unreal Engine project launcher and toolbox
        </p>
        <StatusPanel />
      </div>
    </BaseLayout>
  );
}

export default App;
