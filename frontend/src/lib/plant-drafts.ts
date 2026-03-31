import type { Plant } from '@/lib/plants'

export interface WikimediaImageResponse {
  latin_name: string
  image_url: string | null
}

export interface CreatePlantFromNameAiDraftOptions {
  plantName: string
  token: string
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

function createJsonHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
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

export async function createPlantFromNameAi(plantName: string, token: string, preferredImageUrl?: string): Promise<Plant> {
  const response = await fetch('/api/plants/from-name-ai', {
    method: 'POST',
    headers: createJsonHeaders(token),
    body: JSON.stringify({
      plant_name: plantName,
      preferred_image_url: preferredImageUrl ?? null,
    }),
  })

  return parseJsonResponse<Plant>(response, 'Nie udało się utworzyć rośliny przy użyciu AI.')
}

export async function getWikimediaImage(latinName: string, token: string): Promise<WikimediaImageResponse> {
  const response = await fetch(`/api/wiki/wikimedia-image?latin_name=${encodeURIComponent(latinName)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return parseJsonResponse<WikimediaImageResponse>(response, 'Nie udało się pobrać zdjęcia z Wikimedia Commons.')
}

export async function updatePlantImageFromUrl(plantId: number, payload: PlantImageUrlUpdatePayload, token: string): Promise<Plant> {
  const response = await fetch(`/api/plants/${plantId}/image/from-url`, {
    method: 'PUT',
    headers: createJsonHeaders(token),
    body: JSON.stringify(payload),
  })

  return parseJsonResponse<Plant>(response, 'Nie udało się zapisać zdjęcia rośliny.')
}

export async function createPlantFromNameAiDraft({
  plantName,
  token,
  fallbackImageSearchTerm,
  preferredImageUrl,
}: CreatePlantFromNameAiDraftOptions): Promise<CreatePlantFromNameAiDraftResult> {
  const plant = await createPlantFromNameAi(plantName, token, preferredImageUrl)

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
    const wikimediaImage = await getWikimediaImage(imageSearchQuery, token)

    if (!wikimediaImage.image_url) {
      return {
        plant,
        imageApplied: false,
        imageLookupAttempted: true,
        imageLookupFailed: false,
      }
    }

    const updatedPlant = await updatePlantImageFromUrl(plant.id, { image_url: wikimediaImage.image_url }, token)

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