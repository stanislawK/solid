import type { ChangeEventHandler, RefObject } from 'react'
import { ArrowLeft, Camera, Image as ImageIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface IdentifyUploadStepProps {
  isIdentifying: boolean
  identifyError: string | null
  identificationFileName: string | null
  fileInputRef: RefObject<HTMLInputElement>
  cameraInputRef: RefObject<HTMLInputElement>
  onFileSelected: ChangeEventHandler<HTMLInputElement>
  onBack: () => void
}

export function IdentifyUploadStep({
  isIdentifying,
  identifyError,
  identificationFileName,
  fileInputRef,
  cameraInputRef,
  onFileSelected,
  onBack,
}: IdentifyUploadStepProps) {
  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Camera className="size-5" />
          </div>
          <div>
            <CardTitle>Dodaj zdjęcie rośliny</CardTitle>
            <CardDescription>
              Wgraj plik z dysku albo skorzystaj z aparatu na telefonie. To zdjęcie stanie się domyślnym zdjęciem rośliny po utworzeniu szkicu.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="rounded-3xl border border-dashed border-border/70 bg-background/70 p-6 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ImageIcon className="size-6" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Rozpoznaj roślinę na podstawie zdjęcia</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Najlepiej sprawdzają się wyraźne zdjęcia liści lub całej rośliny w naturalnym świetle.
          </p>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={() => fileInputRef.current?.click()} disabled={isIdentifying}>
              <ImageIcon className="size-4" />
              {isIdentifying ? 'Rozpoznawanie...' : 'Wybierz z dysku'}
            </Button>
            <Button variant="secondary" onClick={() => cameraInputRef.current?.click()} disabled={isIdentifying}>
              <Camera className="size-4" />
              {isIdentifying ? 'Rozpoznawanie...' : 'Zrób zdjęcie'}
            </Button>
          </div>
        </div>

        <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={onFileSelected} />
        <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={onFileSelected} />

        {identifyError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {identifyError}
          </div>
        )}

        {identificationFileName && !isIdentifying && (
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
            Ostatnio wybrane zdjęcie: <span className="font-medium text-foreground">{identificationFileName}</span>
          </div>
        )}

        <div className="flex justify-start">
          <Button variant="outline" onClick={onBack} disabled={isIdentifying}>
            <ArrowLeft className="size-4" />
            Wróć do wyboru sposobu
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}