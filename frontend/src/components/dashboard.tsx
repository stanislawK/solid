import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

import { useAuth } from '@/components/auth-provider';
import { PlantCard } from '@/components/plant-card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import type { Plant } from '@/lib/plants';

const SEARCH_DEBOUNCE_MS = 450;

function matchesSearchQuery(plant: Plant, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }

  return plant.name.toLocaleLowerCase().includes(normalizedQuery)
    || plant.latin_name?.toLocaleLowerCase().includes(normalizedQuery)
    || false;
}

export function Dashboard() {
  const { isLoggedIn } = useAuth();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchTerm]);

  useEffect(() => {
    if (!isLoggedIn) {
      setPlants([]);
      setSearchTerm('');
      setDebouncedSearchTerm('');
      setLoading(false);
      setHasLoadedOnce(false);
      return;
    }

    const controller = new AbortController();
    const searchParams = new URLSearchParams();

    if (debouncedSearchTerm.length > 0) {
      searchParams.set('q', debouncedSearchTerm);
    }

    const endpoint = searchParams.size > 0 ? `/api/plants?${searchParams.toString()}` : '/api/plants';

    setLoading(!hasLoadedOnce);

    apiFetch(endpoint, { signal: controller.signal })
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
        if (controller.signal.aborted) {
          return;
        }

        console.error('Failed to fetch plants', err);
        setPlants([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setHasLoadedOnce(true);
        }
      });

    return () => {
      controller.abort();
    };
  }, [debouncedSearchTerm, isLoggedIn]);

  const activeSearchTerm = debouncedSearchTerm.trim();

  const dashboardHeader = (
    <div className="text-center space-y-4">
      <h1 className="text-4xl font-bold">Twoja kolekcja roślin</h1>
      <p className="text-xl text-muted-foreground">Oto rośliny pod Twoją opieką.</p>
      <div className="mx-auto w-full max-w-md text-left">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="plants-search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Szukaj rośliny po nazwie"
            className="h-11 pl-9"
          />
        </div>
      </div>
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
          <p className="text-xl text-muted-foreground">
            {activeSearchTerm.length > 0
              ? 'Nie znaleziono roślin pasujących do tego wyszukiwania.'
              : 'Nie masz jeszcze żadnych roślin. Czas to zmienić!'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      {dashboardHeader}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {plants.map((plant) => (
          <PlantCard 
            key={plant.id} 
            plant={plant} 
            onPlantDeleted={() => setPlants(p => p.filter(x => x.id !== plant.id))}
            onPlantUpdated={(updated) => setPlants((currentPlants) => {
              const nextPlants = currentPlants.map((currentPlant) => (
                currentPlant.id === plant.id ? updated : currentPlant
              ));

              return matchesSearchQuery(updated, activeSearchTerm)
                ? nextPlants
                : nextPlants.filter((currentPlant) => currentPlant.id !== updated.id);
            })}
          />
        ))}
      </div>
    </div>
  );
}
