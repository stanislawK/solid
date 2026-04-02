import type { Plant } from '@/lib/plants'
import { apiFetch } from '@/lib/api'

export interface WikimediaImageResponse {
  latin_name: string
  image_url: string | null
}

export interface CreatePlantFromNameAiDraftOptions {
  plantName: string
  fallbackImageSearchTerm?: string
  preferredImageUrl?: string
}

export interface CreatePlantFromNameAiDraftResult {
  plant: Plant
  imageApplied: boolean
  imageLookupAttempted: boolean
  imageLookupFailed: boolean
}

interface PlantImageUrlUpdatePayload {
  image_url: string
}

async function parseJsonResponse<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(errorMessage)
  }

  return (await response.json()) as T
}

export function getPlantImageSearchQuery(plant: Plant, fallbackSearchTerm?: string) {
  const candidates = [plant.image_search_query, plant.latin_name, fallbackSearchTerm]

  for (const candidate of candidates) {
    const normalizedCandidate = candidate?.trim()

    if (normalizedCandidate) {
      return normalizedCandidate
    }
  }

  return null
}

export async function createPlantFromNameAi(plantName: string, preferredImageUrl?: string): Promise<Plant> {
  const response = await apiFetch('/api/plants/from-name-ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plant_name: plantName,
      preferred_image_url: preferredImageUrl ?? null,
    }),
  })

  return parseJsonResponse<Plant>(response, 'Nie udało się utworzyć rośliny przy użyciu AI.')
}

export async function getWikimediaImage(latinName: string): Promise<WikimediaImageResponse> {
  const response = await apiFetch(`/api/wiki/wikimedia-image?latin_name=${encodeURIComponent(latinName)}`)

  return parseJsonResponse<WikimediaImageResponse>(response, 'Nie udało się pobrać zdjęcia z Wikimedia Commons.')
}

export async function updatePlantImageFromUrl(plantId: number, payload: PlantImageUrlUpdatePayload): Promise<Plant> {
  const response = await apiFetch(`/api/plants/${plantId}/image/from-url`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse<Plant>(response, 'Nie udało się zapisać zdjęcia rośliny.')
}

export async function createPlantFromNameAiDraft({
  plantName,
  fallbackImageSearchTerm,
  preferredImageUrl,
}: CreatePlantFromNameAiDraftOptions): Promise<CreatePlantFromNameAiDraftResult> {
  const plant = await createPlantFromNameAi(plantName, preferredImageUrl)

  if (preferredImageUrl) {
    return {
      plant,
      imageApplied: true,
      imageLookupAttempted: false,
      imageLookupFailed: false,
    }
  }

  const imageSearchQuery = getPlantImageSearchQuery(plant, fallbackImageSearchTerm)

  if (!imageSearchQuery) {
    return {
      plant,
      imageApplied: false,
      imageLookupAttempted: false,
      imageLookupFailed: false,
    }
  }

  try {
    const wikimediaImage = await getWikimediaImage(imageSearchQuery)

    if (!wikimediaImage.image_url) {
      return {
        plant,
        imageApplied: false,
        imageLookupAttempted: true,
        imageLookupFailed: false,
      }
    }

    const updatedPlant = await updatePlantImageFromUrl(plant.id, { image_url: wikimediaImage.image_url })

    return {
      plant: updatedPlant,
      imageApplied: true,
      imageLookupAttempted: true,
      imageLookupFailed: false,
    }
  } catch {
    return {
      plant,
      imageApplied: false,
      imageLookupAttempted: true,
      imageLookupFailed: true,
    }
  }
}