import { Droplets, Image as ImageIcon, Sun } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { getPlantImageUrl, type Plant } from '@/lib/plants'

interface PlantPreviewCardProps {
  plant: Plant
  className?: string
}

export function PlantPreviewCard({ plant, className }: PlantPreviewCardProps) {
  const imageUrl = getPlantImageUrl(plant.image_url)

  return (
    <Card className={[
      'overflow-hidden flex h-full flex-col bg-card transition-shadow duration-300',
      className,
    ].filter(Boolean).join(' ')}>
      <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted flex items-center justify-center">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={plant.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon className="size-12 text-muted-foreground/50" />
        )}
      </div>

      <CardContent className="flex flex-1 flex-col p-5">
        <div className="mb-3">
          <h3 className="line-clamp-1 text-xl font-bold" title={plant.name}>
            {plant.name}
          </h3>
          {plant.latin_name && (
            <p className="line-clamp-1 text-sm italic text-muted-foreground" title={plant.latin_name}>
              {plant.latin_name}
            </p>
          )}
        </div>

        {plant.description && (
          <div className="mb-4 flex-1">
            <p className="line-clamp-3 text-sm text-muted-foreground" title={plant.description}>
              {plant.description}
            </p>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5" title={`Podlewanie: ${plant.watering}/10`}>
            <Droplets className="size-4 text-blue-500" />
            <span>{plant.watering}/10</span>
          </div>
          <div className="flex items-center gap-1.5" title={`Naświetlenie: ${plant.light}/10`}>
            <Sun className="size-4 text-amber-500" />
            <span>{plant.light}/10</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}