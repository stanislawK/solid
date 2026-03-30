import type { ChangeEventHandler, RefObject } from 'react'
import { ArrowLeft, Camera, Image as ImageIcon, LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

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
              Wybierz z dysku
            </Button>
            <Button variant="secondary" onClick={() => cameraInputRef.current?.click()} disabled={isIdentifying}>
              <Camera className="size-4" />
              Zrób zdjęcie
            </Button>
          </div>

          {isIdentifying && (
            <div className="mt-6 rounded-3xl border border-primary/20 bg-primary/5 p-4 text-left shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <LoaderCircle className="size-5 animate-spin" />
                </div>
                <div className="min-w-0 space-y-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Rozpoznawanie rośliny w toku</p>
                    <p className="text-sm text-muted-foreground">
                      Analizujemy zdjęcie i przygotowujemy najbardziej prawdopodobne propozycje. To zwykle trwa tylko chwilę.
                    </p>
                  </div>
                  {identificationFileName && (
                    <p className="truncate text-xs text-muted-foreground">
                      Przetwarzany plik: <span className="font-medium text-foreground">{identificationFileName}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-5 w-32" />
                  <Skeleton className="mt-2 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-4/5" />
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="mt-3 h-5 w-28" />
                  <Skeleton className="mt-2 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-3/4" />
                </div>
              </div>
            </div>
          )}
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