import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { clampPlantScore, type PlantEditFormState } from './plant-form'

interface PlantEditFormProps {
  form: PlantEditFormState
  onChange: (nextForm: PlantEditFormState) => void
  idPrefix?: string
  className?: string
  descriptionClassName?: string
  showNameFields?: boolean
}

// Shared editable plant fields used by both the creation flow and plant details dialog.
export function PlantEditForm({
  form,
  onChange,
  idPrefix = 'plant',
  className,
  descriptionClassName,
  showNameFields = true,
}: PlantEditFormProps) {
  const updateForm = (patch: Partial<PlantEditFormState>) => {
    onChange({ ...form, ...patch })
  }

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', className)}>
      {showNameFields && (
        <>
          <div className="space-y-2 sm:col-span-2">
            <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
              Nazwa rośliny
            </label>
            <Input
              id={`${idPrefix}-name`}
              value={form.name}
              onChange={(event) => updateForm({ name: event.target.value })}
              placeholder="Nazwa rośliny"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label htmlFor={`${idPrefix}-latin-name`} className="text-sm font-medium">
              Nazwa łacińska
            </label>
            <Input
              id={`${idPrefix}-latin-name`}
              value={form.latin_name}
              onChange={(event) => updateForm({ latin_name: event.target.value })}
              placeholder="Opcjonalnie"
            />
          </div>
        </>
      )}

      <div className="space-y-2 sm:col-span-2">
        <label htmlFor={`${idPrefix}-description`} className="text-sm font-medium">
          Opis
        </label>
        <Textarea
          id={`${idPrefix}-description`}
          value={form.description}
          onChange={(event) => updateForm({ description: event.target.value })}
          placeholder="Dodaj opis rośliny"
          className={cn('min-h-[150px]', descriptionClassName)}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-watering`} className="text-sm font-medium">
          Podlewanie
        </label>
        <Input
          id={`${idPrefix}-watering`}
          type="number"
          min="1"
          max="10"
          value={form.watering}
          onChange={(event) => updateForm({ watering: clampPlantScore(Number(event.target.value)) })}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-light`} className="text-sm font-medium">
          Naświetlenie
        </label>
        <Input
          id={`${idPrefix}-light`}
          type="number"
          min="1"
          max="10"
          value={form.light}
          onChange={(event) => updateForm({ light: clampPlantScore(Number(event.target.value)) })}
        />
      </div>
    </div>
  )
}