import { BaseLayout } from './components/BaseLayout';
import { LauncherTab } from './components/LauncherTab';

function App() {
  return (
    <BaseLayout>
      <div className="space-y-6">
        <LauncherTab />
      </div>
    </BaseLayout>
  );
}

export default App;
