import { useRef, useState } from 'react'
import { Droplets, Sun } from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { PlantCardActions } from '@/components/plant-card/plant-card-actions'
import { PlantImagePanel } from '@/components/plant-card/plant-image-panel'
import { PlantEditForm } from '@/components/plants/plant-edit-form'
import { createPlantEditForm } from '@/components/plants/plant-form'
import { PlantPreviewCard } from '@/components/plant-preview-card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import { getPlantImageUrl, type Plant } from '@/lib/plants'

interface PlantCardProps {
  plant: Plant
  onPlantDeleted?: () => void
  onPlantUpdated?: (plant: Plant) => void
}

export function PlantCard({ plant: initialPlant, onPlantDeleted, onPlantUpdated }: PlantCardProps) {
  const { isLoggedIn } = useAuth()
  const [plant, setPlant] = useState(initialPlant)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editForm, setEditForm] = useState(() => createPlantEditForm(initialPlant))

  const imageUrl = getPlantImageUrl(plant.image_url)

  const handleDelete = async () => {
    if (!confirm('Czy na pewno chcesz usunąć tę roślinę?')) return

    setIsDeleting(true)
    try {
      const res = await apiFetch(`/api/plants/${plant.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Nie udało się usunąć rośliny')

      if (onPlantDeleted) {
        onPlantDeleted()
      } else {
        window.location.reload()
      }
    } catch (err) {
      console.error(err)
      alert('Wystąpił błąd podczas usuwania.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSave = async () => {
    if (!isLoggedIn) {
      alert('Sesja wygasła. Zaloguj się ponownie.')
      return
    }

    setIsSaving(true)
    try {
      const res = await apiFetch(`/api/plants/${plant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm)
      })

      if (!res.ok) throw new Error('Nie udało się zaktualizować rośliny')
      const updatedPlant = await res.json()
      setPlant(updatedPlant)
      setEditForm(createPlantEditForm(updatedPlant))
      setIsEditing(false)
      if (onPlantUpdated) onPlantUpdated(updatedPlant)
    } catch (err) {
      console.error(err)
      alert('Wystąpił błąd podczas zapisywania.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleImageUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await apiFetch(`/api/plants/${plant.id}/image`, {
        method: 'PUT',
        body: formData,
      })

      if (!res.ok) throw new Error('Nie udało się zaktualizować zdjęcia')

      const data = await res.json()
      const newPlant = { ...plant, image_url: data.image_url }
      setPlant(newPlant)
      if (onPlantUpdated) onPlantUpdated(newPlant)
    } catch (err) {
      console.error(err)
      alert('Wystąpił błąd podczas wgrywania zdjęcia.')
    }
  }

  const handleEditToggle = () => {
    if (isEditing) {
      setEditForm(createPlantEditForm(plant))
    }
    setIsEditing(!isEditing)
  }

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
            <PlantImagePanel
              plantName={plant.name}
              imageUrl={imageUrl}
              isEditing={isEditing}
              fileInputRef={fileInputRef}
              onImageUpdate={handleImageUpdate}
            />
            
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
                <p className="font-medium mt-1">Edytowane w formularzu poniżej</p>
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
                <p className="font-medium mt-1">Edytowane w formularzu poniżej</p>
              ) : (
                <p className="font-medium mt-1">{plant.light} / 10</p>
              )}
            </div>
          </div>

          <div className="mt-2 text-left">
            <h4 className="text-sm font-semibold mb-2">Opis</h4>
            {isEditing ? (
              <PlantEditForm
                form={editForm}
                onChange={setEditForm}
                idPrefix={`plant-card-${plant.id}`}
                showNameFields={false}
                descriptionClassName="min-h-[100px] text-sm"
              />
            ) : (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {plant.description || <span className="text-muted-foreground italic">Brak opisu</span>}
              </p>
            )}
          </div>
        </div>

        <PlantCardActions
          isEditing={isEditing}
          isDeleting={isDeleting}
          isSaving={isSaving}
          onDelete={handleDelete}
          onEditToggle={handleEditToggle}
          onSave={handleSave}
        />
      </DialogContent>
    </Dialog>
  )
}
