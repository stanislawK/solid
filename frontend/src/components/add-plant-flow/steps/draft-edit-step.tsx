import type { ChangeEventHandler, RefObject } from 'react'
import { ArrowLeft, Camera, Check, Image as ImageIcon } from 'lucide-react'

import { PlantEditForm } from '@/components/plants/plant-edit-form'
import { PlantPreviewCard } from '@/components/plant-preview-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Plant } from '@/lib/plants'

import type { PlantEditFormState } from '@/components/plants/plant-form'

interface DraftEditStepProps {
  draftPlant: Plant | null
  imageUrl?: string
  isUploadingImage: boolean
  imageUploadError: string | null
  editError: string | null
  isSavingEdits: boolean
  isEditDirty: boolean
  editForm: PlantEditFormState
  imageInputRef: RefObject<HTMLInputElement>
  onImageUpload: ChangeEventHandler<HTMLInputElement>
  onEditFormChange: (nextForm: PlantEditFormState) => void
  onBack: () => void
  onSave: () => void
  onFinish: () => void
}

export function DraftEditStep({
  draftPlant,
  imageUrl,
  isUploadingImage,
  imageUploadError,
  editError,
  isSavingEdits,
  isEditDirty,
  editForm,
  imageInputRef,
  onImageUpload,
  onEditFormChange,
  onBack,
  onSave,
  onFinish,
}: DraftEditStepProps) {
  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ImageIcon className="size-5" />
          </div>
          <div>
            <CardTitle>Dopracuj szczegóły rośliny</CardTitle>
            <CardDescription>
              Uzupełnij opis, popraw oceny i wgraj własne zdjęcie przed zakończeniem.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        {!draftPlant ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
            Najpierw wybierz artykuł i wygeneruj szkic rośliny.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <div className="space-y-4">
              <PlantPreviewCard plant={draftPlant} />
              <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Zdjęcie rośliny</p>
                    <p className="text-sm text-muted-foreground">PNG, JPG lub inny obsługiwany format obrazu.</p>
                  </div>
                  <Button variant="outline" onClick={() => imageInputRef.current?.click()} disabled={isUploadingImage}>
                    <Camera className="size-4" />
                    {isUploadingImage ? 'Wgrywanie...' : 'Zmień zdjęcie'}
                  </Button>
                </div>
                <input ref={imageInputRef} type="file" className="hidden" accept="image/*" onChange={onImageUpload} />
                {imageUploadError && <p className="mt-3 text-sm text-destructive">{imageUploadError}</p>}
                {imageUrl && !imageUploadError && (
                  <p className="mt-3 text-sm text-muted-foreground">Aktualne zdjęcie zostało już zapisane w szkicu.</p>
                )}
              </div>
            </div>

            <div className="space-y-5">
              <PlantEditForm form={editForm} onChange={onEditFormChange} idPrefix="draft-plant" />

              {editError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {editError}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={onBack} disabled={isSavingEdits || isUploadingImage}>
                  <ArrowLeft className="size-4" />
                  Wróć do podglądu
                </Button>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button variant="secondary" onClick={onSave} disabled={!isEditDirty || isSavingEdits || isUploadingImage}>
                    <Check className="size-4" />
                    {isSavingEdits ? 'Zapisywanie...' : 'Zapisz zmiany'}
                  </Button>
                  <Button onClick={onFinish} disabled={isSavingEdits || isUploadingImage}>
                    <Check className="size-4" />
                    Zakończ
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}