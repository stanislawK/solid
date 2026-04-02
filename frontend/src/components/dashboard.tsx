import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { PlantCard } from '@/components/plant-card';
import { apiFetch } from '@/lib/api';
import type { Plant } from '@/lib/plants';

export function Dashboard() {
  const { isLoggedIn } = useAuth();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) {
      setPlants([]);
      setLoading(false);
      return;
    }

    apiFetch('/api/plants')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch plants');
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setPlants(data);
        } else {
          setPlants([]);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch plants', err);
        setPlants([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isLoggedIn]);

  const dashboardHeader = (
    <div className="text-center space-y-4">
      <h1 className="text-4xl font-bold">Twoja kolekcja roślin</h1>
      <p className="text-xl text-muted-foreground">Oto rośliny pod Twoją opieką.</p>
    </div>
  );

  if (loading) {
    return (
      <div className="w-full max-w-6xl mx-auto space-y-8">
        {dashboardHeader}
        <div className="text-center p-8">Ładowanie...</div>
      </div>
    );
  }

  if (plants.length === 0) {
    return (
      <div className="w-full max-w-6xl mx-auto space-y-8">
        {dashboardHeader}
        <div className="text-center space-y-4 max-w-lg mb-8 mx-auto">
          <p className="text-xl text-muted-foreground">Nie masz jeszcze żadnych roślin. Czas to zmienić!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      {dashboardHeader}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {plants.map((plant) => (
          <PlantCard 
            key={plant.id} 
            plant={plant} 
            onPlantDeleted={() => setPlants(p => p.filter(x => x.id !== plant.id))}
            onPlantUpdated={(updated) => setPlants(p => p.map(x => x.id === plant.id ? updated : x))}
          />
        ))}
      </div>
    </div>
  );
}
