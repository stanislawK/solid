import type { Plant, PlantUpdatePayload } from '@/lib/plants'

export interface PlantEditFormState {
  name: string
  latin_name: string
  description: string
  watering: number
  light: number
}

export const DEFAULT_PLANT_EDIT_FORM: PlantEditFormState = {
  name: '',
  latin_name: '',
  description: '',
  watering: 5,
  light: 5,
}

export function createPlantEditForm(plant: Plant): PlantEditFormState {
  return {
    name: plant.name,
    latin_name: plant.latin_name ?? '',
    description: plant.description ?? '',
    watering: plant.watering,
    light: plant.light,
  }
}

function normalizeOptionalString(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function clampPlantScore(value: number) {
  return Math.min(10, Math.max(1, Number.isFinite(value) ? value : 1))
}

export function buildPlantUpdatePayload(editForm: PlantEditFormState): PlantUpdatePayload {
  return {
    name: editForm.name.trim(),
    latin_name: normalizeOptionalString(editForm.latin_name),
    description: normalizeOptionalString(editForm.description),
    watering: editForm.watering,
    light: editForm.light,
  }
}