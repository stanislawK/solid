export interface Plant {
  id: number
  name: string
  latin_name?: string | null
  description?: string | null
  watering: number
  light: number
  image_url?: string | null
  added_at: string
  user_id: number
}

export interface PlantUpdatePayload {
  name?: string | null
  latin_name?: string | null
  description?: string | null
  watering?: number | null
  light?: number | null
}

export function getPlantImageUrl(imageUrl?: string | null) {
  if (!imageUrl) {
    return undefined
  }

  return imageUrl.startsWith('/images') ? `/api${imageUrl}` : imageUrl
}