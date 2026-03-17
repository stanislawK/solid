import { useEffect, useState } from 'react';
import { Leaf, Activity } from 'lucide-react';

function App() {
  const [health, setHealth] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    // Check connection to backend
    fetch('/api/health')
      .then((res) => {
        if (res.ok) setHealth('ok');
        else setHealth('error');
      })
      .catch(() => setHealth('error'));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-neutral-100">
        <div className="flex items-center justify-center space-x-3 mb-6">
          <Leaf className="w-10 h-10 text-green-500" />
          <h1 className="text-2xl font-bold text-neutral-800">Solid Web</h1>
        </div>
        
        <p className="text-neutral-600 text-center mb-8">
          Welcome to the new frontend for the Solid API. This interface acts as the modern landing page.
        </p>

        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg border border-neutral-100">
            <div className="flex items-center space-x-3 text-neutral-700">
              <Activity className="w-5 h-5" />
              <span className="font-medium">Backend Connectivity</span>
            </div>
            <div>
              {health === 'loading' && (
                <span className="text-sm px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium animate-pulse">Checking...</span>
              )}
              {health === 'ok' && (
                <span className="text-sm px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">Online</span>
              )}
              {health === 'error' && (
                <span className="text-sm px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">Offline</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;