import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Droplets, Sun, Image as ImageIcon, Edit, Trash2, Camera, Check, X } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { PlantPreviewCard } from '@/components/plant-preview-card';
import { getPlantImageUrl, type Plant } from '@/lib/plants';

interface PlantCardProps {
  plant: Plant;
  onPlantDeleted?: () => void;
  onPlantUpdated?: (plant: Plant) => void;
}

export function PlantCard({ plant: initialPlant, onPlantDeleted, onPlantUpdated }: PlantCardProps) {
  const { token } = useAuth();
  const [plant, setPlant] = useState(initialPlant);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Edit State
  const [editForm, setEditForm] = useState({
    name: plant.name,
    latin_name: plant.latin_name || '',
    description: plant.description || '',
    watering: plant.watering,
    light: plant.light,
  });

  const imageUrl = getPlantImageUrl(plant.image_url);

  const handleDelete = async () => {
    if (!confirm('Czy na pewno chcesz usunąć tę roślinę?')) return;
    
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/plants/${plant.id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) throw new Error('Nie udało się usunąć rośliny');
      
      if (onPlantDeleted) {
        onPlantDeleted();
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      alert('Wystąpił błąd podczas usuwania.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/plants/${plant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(editForm)
      });
      
      if (!res.ok) throw new Error('Nie udało się zaktualizować rośliny');
      const updatedPlant = await res.json();
      setPlant(updatedPlant);
      setIsEditing(false);
      if (onPlantUpdated) onPlantUpdated(updatedPlant);
    } catch (err) {
      console.error(err);
      alert('Wystąpił błąd podczas zapisywania.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/plants/${plant.id}/image`, {
        method: 'PUT',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData,
      });

      if (!res.ok) throw new Error('Nie udało się zaktualizować zdjęcia');
      
      const data = await res.json();
      const newPlant = { ...plant, image_url: data.image_url };
      setPlant(newPlant);
      if (onPlantUpdated) onPlantUpdated(newPlant);
    } catch (err) {
      console.error(err);
      alert('Wystąpił błąd podczas wgrywania zdjęcia.');
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      setEditForm({
        name: plant.name,
        latin_name: plant.latin_name || '',
        description: plant.description || '',
        watering: plant.watering,
        light: plant.light,
      });
    }
    setIsEditing(!isEditing);
  };

  return (
    <Dialog>
      <DialogTrigger className="block w-full h-full p-0 bg-transparent border-0 text-left focus:outline-none">
        <div className="group h-full cursor-pointer">
          <PlantPreviewCard plant={plant} className="h-full hover:shadow-lg group-hover:shadow-lg" />
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md w-11/12 max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogDescription className="sr-only">Szczegóły widoku rośliny</DialogDescription>
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="relative group shrink-0">
              {imageUrl ? (
                isEditing ? (
                  <img
                    src={imageUrl}
                    alt={plant.name}
                    className="w-20 h-20 rounded-lg object-cover bg-muted"
                  />
                ) : (
                  <Dialog>
                    <DialogTrigger className="p-0 border-0 bg-transparent focus:outline-none">
                      <img
                        src={imageUrl}
                        alt={plant.name}
                        className="w-20 h-20 rounded-lg object-cover bg-muted cursor-pointer transition-transform duration-300 hover:scale-110 hover:shadow-md hover:z-10 relative"
                      />
                    </DialogTrigger>
                    <DialogContent showCloseButton={false} className="max-w-4xl border-none bg-transparent shadow-none flex justify-center items-center">
                      <DialogTitle className="sr-only">Zdjęcie rośliny {plant.name}</DialogTitle>
                      <DialogClose className="p-0 border-none bg-transparent focus:outline-none">
                        <img
                          src={imageUrl}
                          alt={plant.name}
                          className="max-w-full max-h-[85vh] rounded-lg object-contain drop-shadow-2xl cursor-pointer"
                        />
                      </DialogClose>
                    </DialogContent>
                  </Dialog>
                )
              ) : (
                <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                </div>
              )}
              {isEditing && (
                <div 
                  className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                  title="Zmień zdjęcie"
                >
                  <Camera className="w-6 h-6 text-white" />
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleImageUpdate}
              />
            </div>
            
            <div className="flex-1 w-full overflow-hidden flex flex-col justify-center min-h-[5rem]">
              {isEditing ? (
                <div className="space-y-2">
                  <Input 
                    value={editForm.name}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    placeholder="Nazwa rośliny"
                    className="font-bold text-lg h-9"
                  />
                  <Input 
                    value={editForm.latin_name}
                    onChange={(e) => setEditForm({...editForm, latin_name: e.target.value})}
                    placeholder="Nazwa łacińska (opcjonalnie)"
                    className="text-sm italic h-8"
                  />
                </div>
              ) : (
                <>
                  <DialogTitle className="text-2xl break-words text-left">{plant.name}</DialogTitle>
                  {plant.latin_name && (
                    <p className="text-sm italic text-muted-foreground mt-1 break-words text-left">
                      {plant.latin_name}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogHeader>
        
        <div className="py-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-1 bg-muted/40 p-3 rounded-md">
              <div className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-blue-500 shrink-0" />
                <p className="text-xs text-muted-foreground">Podlewanie</p>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input 
                    type="number"
                    min="1" max="10"
                    value={editForm.watering}
                    onChange={(e) => setEditForm({...editForm, watering: parseInt(e.target.value) || 1})}
                    className="h-8 text-sm w-full"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">/ 10</span>
                </div>
              ) : (
                <p className="font-medium mt-1">{plant.watering} / 10</p>
              )}
            </div>
            <div className="flex flex-col gap-1 bg-muted/40 p-3 rounded-md">
              <div className="flex items-center gap-2">
                <Sun className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-xs text-muted-foreground">Naświetlenie</p>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input 
                    type="number"
                    min="1" max="10"
                    value={editForm.light}
                    onChange={(e) => setEditForm({...editForm, light: parseInt(e.target.value) || 1})}
                    className="h-8 text-sm w-full"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">/ 10</span>
                </div>
              ) : (
                <p className="font-medium mt-1">{plant.light} / 10</p>
              )}
            </div>
          </div>

          <div className="mt-2 text-left">
            <h4 className="text-sm font-semibold mb-2">Opis</h4>
            {isEditing ? (
              <Textarea 
                value={editForm.description}
                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                placeholder="Dodaj opis rośliny..."
                className="min-h-[100px] text-sm"
              />
            ) : (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {plant.description || <span className="text-muted-foreground italic">Brak opisu</span>}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between items-center w-full sm:flex-row flex-col gap-2 m-0 p-4 border-t bg-transparent">
          {!isEditing ? (
            <>
              <Button variant="destructive" className="w-full sm:w-auto flex items-center gap-2" onClick={handleDelete} disabled={isDeleting}>
                <Trash2 className="w-4 h-4" /> {isDeleting ? 'Usuwanie...' : 'Usuń'}
              </Button>
              <Button variant="outline" className="w-full sm:w-auto flex items-center gap-2" onClick={handleEditToggle}>
                <Edit className="w-4 h-4" /> Edytuj
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="w-full sm:w-auto flex items-center gap-2" onClick={handleEditToggle} disabled={isSaving}>
                <X className="w-4 h-4" /> Anuluj
              </Button>
              <Button className="w-full sm:w-auto flex items-center gap-2" onClick={handleSave} disabled={isSaving}>
                <Check className="w-4 h-4" /> {isSaving ? 'Zapisywanie...' : 'Zapisz'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
