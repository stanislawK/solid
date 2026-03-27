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

export interface AiPlantProposal {
  name: string
  latin_name?: string | null
}

export interface AiPlantIdentificationResponse {
  image_url: string
  proposals: AiPlantProposal[]
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

export function getWikipediaQueryFromProposal(proposal: AiPlantProposal) {
  const polishName = proposal.name.trim()
  const latinName = proposal.latin_name?.trim() ?? ''

  if (polishName.length > 0) {
    return polishName
  }

  return latinName
}