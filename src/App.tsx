import { BaseLayout } from './components/BaseLayout';

function App() {
  return (
    <BaseLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">UE Launcher</h1>
        <p className="text-zinc-400">
          Unreal Engine project launcher and toolbox
        </p>
      </div>
    </BaseLayout>
  );
}

export default App;
