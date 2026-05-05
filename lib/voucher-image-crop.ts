export type VoucherImageKind = "logo" | "banner"

export interface CropAreaPixels {
  x: number
  y: number
  width: number
  height: number
}

export interface VoucherCropOutput {
  width: number
  height: number
  mimeType: "image/png" | "image/webp"
  fileName: string
  quality?: number
}

const OUTPUTS: Record<VoucherImageKind, VoucherCropOutput> = {
  logo: {
    width: 512,
    height: 512,
    mimeType: "image/png",
    fileName: "voucher-logo.png",
  },
  banner: {
    width: 1200,
    height: 300,
    mimeType: "image/webp",
    fileName: "voucher-banner.webp",
    quality: 0.92,
  },
}

export function getVoucherCropOutput(kind: VoucherImageKind): VoucherCropOutput {
  return OUTPUTS[kind]
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener("load", () => resolve(image))
    image.addEventListener("error", () => reject(new Error("Unable to load image for cropping")))
    image.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, output: VoucherCropOutput): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to export cropped image"))
          return
        }
        resolve(blob)
      },
      output.mimeType,
      output.quality,
    )
  })
}

export async function createCroppedVoucherAsset(
  imageSrc: string,
  crop: CropAreaPixels,
  kind: VoucherImageKind,
): Promise<File> {
  const output = getVoucherCropOutput(kind)
  const image = await loadImage(imageSrc)
  const canvas = document.createElement("canvas")
  canvas.width = output.width
  canvas.height = output.height

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Image cropping is not supported in this browser")
  }

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    output.width,
    output.height,
  )

  const blob = await canvasToBlob(canvas, output)

  return new File([blob], output.fileName, {
    type: output.mimeType,
    lastModified: Date.now(),
  })
}
