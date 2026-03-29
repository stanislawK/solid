import { Check, Edit, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'

interface PlantCardActionsProps {
  isEditing: boolean
  isDeleting: boolean
  isSaving: boolean
  onDelete: () => void
  onEditToggle: () => void
  onSave: () => void
}

export function PlantCardActions({
  isEditing,
  isDeleting,
  isSaving,
  onDelete,
  onEditToggle,
  onSave,
}: PlantCardActionsProps) {
  return (
    <DialogFooter className="flex sm:justify-between items-center w-full sm:flex-row flex-col gap-2 m-0 p-4 border-t bg-transparent">
      {!isEditing ? (
        <>
          <Button variant="destructive" className="w-full sm:w-auto flex items-center gap-2" onClick={onDelete} disabled={isDeleting}>
            <Trash2 className="w-4 h-4" /> {isDeleting ? 'Usuwanie...' : 'Usuń'}
          </Button>
          <Button variant="outline" className="w-full sm:w-auto flex items-center gap-2" onClick={onEditToggle}>
            <Edit className="w-4 h-4" /> Edytuj
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" className="w-full sm:w-auto flex items-center gap-2" onClick={onEditToggle} disabled={isSaving}>
            <X className="w-4 h-4" /> Anuluj
          </Button>
          <Button className="w-full sm:w-auto flex items-center gap-2" onClick={onSave} disabled={isSaving}>
            <Check className="w-4 h-4" /> {isSaving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </>
      )}
    </DialogFooter>
  )
}