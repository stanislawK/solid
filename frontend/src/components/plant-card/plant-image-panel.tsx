import type { ChangeEventHandler, RefObject } from 'react'
import { Camera, Image as ImageIcon } from 'lucide-react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface PlantImagePanelProps {
  plantName: string
  imageUrl?: string
  isEditing: boolean
  fileInputRef: RefObject<HTMLInputElement>
  onImageUpdate: ChangeEventHandler<HTMLInputElement>
}

export function PlantImagePanel({
  plantName,
  imageUrl,
  isEditing,
  fileInputRef,
  onImageUpdate,
}: PlantImagePanelProps) {
  return (
    <div className="relative group shrink-0">
      {imageUrl ? (
        isEditing ? (
          <img src={imageUrl} alt={plantName} className="w-20 h-20 rounded-lg object-cover bg-muted" />
        ) : (
          <Dialog>
            <DialogTrigger className="p-0 border-0 bg-transparent focus:outline-none">
              <img
                src={imageUrl}
                alt={plantName}
                className="w-20 h-20 rounded-lg object-cover bg-muted cursor-pointer transition-transform duration-300 hover:scale-110 hover:shadow-md hover:z-10 relative"
              />
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="max-w-4xl border-none bg-transparent shadow-none flex justify-center items-center">
              <DialogTitle className="sr-only">Zdjęcie rośliny {plantName}</DialogTitle>
              <DialogClose className="p-0 border-none bg-transparent focus:outline-none">
                <img
                  src={imageUrl}
                  alt={plantName}
                  className="max-w-full max-h-[85vh] rounded-lg object-contain drop-shadow-2xl cursor-pointer"
                />
              </DialogClose>
            </DialogContent>
          </Dialog>
        )
      ) : (
        <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
        </div>
      )}
      {isEditing && (
        <div
          className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          title="Zmień zdjęcie"
        >
          <Camera className="w-6 h-6 text-white" />
        </div>
      )}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onImageUpdate} />
    </div>
  )
}