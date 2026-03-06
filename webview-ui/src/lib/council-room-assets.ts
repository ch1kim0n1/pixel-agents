import { buildDynamicCatalog, type LoadedAssetData } from '../office/layout/furnitureCatalog.js'
import { setCharacterTemplates } from '../office/sprites/spriteData.js'
import type { SpriteData } from '../office/types.js'

const PNG_ALPHA_THRESHOLD = 128
const CHAR_FRAME_W = 16
const CHAR_FRAME_H = 32
const CHAR_FRAMES_PER_ROW = 7
const CHAR_DIRECTIONS = ['down', 'up', 'right'] as const
const DEFAULT_ASSET_BASE_URL = '/assets'
const DEFAULT_CHAR_COUNT = 6

type CharacterDirection = (typeof CHAR_DIRECTIONS)[number]

type CharacterDirectionSprites = Record<CharacterDirection, SpriteData[]>

type FurnitureCatalogAsset = LoadedAssetData['catalog'][number] & {
  file: string
}

interface FurnitureCatalogPayload {
  assets?: FurnitureCatalogAsset[]
}

export interface CouncilRoomAssetLoadResult {
  customFurnitureApplied: boolean
  characterSpritesApplied: boolean
  loadedCharacterCount: number
}

const loadPromiseByBaseUrl = new Map<string, Promise<CouncilRoomAssetLoadResult>>()

function normalizeAssetBaseUrl(assetBaseUrl?: string): string {
  const normalized = (assetBaseUrl ?? DEFAULT_ASSET_BASE_URL).trim()
  if (!normalized) return DEFAULT_ASSET_BASE_URL
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function toAssetUrl(baseUrl: string, relativePath: string): string {
  const cleanedPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  return `${baseUrl}/${cleanedPath}`
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    image.src = url
  })
}

function imageToPixelData(image: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to get 2D context while decoding sprite image')
  }
  context.clearRect(0, 0, image.width, image.height)
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, image.width, image.height)
}

function pixelDataToSprite(
  imageData: ImageData,
  offsetX = 0,
  offsetY = 0,
  width = imageData.width,
  height = imageData.height,
): SpriteData {
  const sprite: SpriteData = []
  const sourceWidth = imageData.width
  const sourceHeight = imageData.height
  const pixels = imageData.data

  for (let row = 0; row < height; row += 1) {
    const rowPixels: string[] = []
    const sourceY = offsetY + row
    for (let col = 0; col < width; col += 1) {
      const sourceX = offsetX + col
      if (sourceX < 0 || sourceX >= sourceWidth || sourceY < 0 || sourceY >= sourceHeight) {
        rowPixels.push('')
        continue
      }

      const pixelIndex = (sourceY * sourceWidth + sourceX) * 4
      const r = pixels[pixelIndex]
      const g = pixels[pixelIndex + 1]
      const b = pixels[pixelIndex + 2]
      const a = pixels[pixelIndex + 3]

      if (a < PNG_ALPHA_THRESHOLD) {
        rowPixels.push('')
        continue
      }

      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase()
      rowPixels.push(hex)
    }
    sprite.push(rowPixels)
  }

  return sprite
}

async function fetchFurnitureAssets(assetBaseUrl: string): Promise<LoadedAssetData | null> {
  try {
    const catalogUrl = toAssetUrl(assetBaseUrl, 'furniture/furniture-catalog.json')
    const response = await fetch(catalogUrl, { cache: 'no-cache' })
    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as FurnitureCatalogPayload
    const catalog = Array.isArray(payload.assets) ? payload.assets : []
    if (catalog.length === 0) {
      return null
    }

    const spritePairs = await Promise.all(
      catalog.map(async (asset) => {
        try {
          const relativePath = asset.file.startsWith('assets/')
            ? asset.file.slice('assets/'.length)
            : asset.file
          const image = await loadImage(toAssetUrl(assetBaseUrl, relativePath))
          const pixelData = imageToPixelData(image)
          const sprite = pixelDataToSprite(pixelData, 0, 0, asset.width, asset.height)
          return [asset.id, sprite] as const
        } catch (error) {
          console.warn(`[CouncilRoom] Failed to load furniture sprite "${asset.id}":`, error)
          return null
        }
      }),
    )

    const sprites: Record<string, SpriteData> = {}
    for (const pair of spritePairs) {
      if (!pair) continue
      const [assetId, sprite] = pair
      sprites[assetId] = sprite
    }

    if (Object.keys(sprites).length === 0) {
      return null
    }

    return { catalog, sprites }
  } catch (error) {
    console.warn('[CouncilRoom] Failed to load furniture catalog:', error)
    return null
  }
}

async function fetchCharacterSprites(assetBaseUrl: string): Promise<CharacterDirectionSprites[] | null> {
  const characters: CharacterDirectionSprites[] = []

  for (let index = 0; index < DEFAULT_CHAR_COUNT; index += 1) {
    try {
      const image = await loadImage(toAssetUrl(assetBaseUrl, `characters/char_${index}.png`))
      if (image.width < CHAR_FRAME_W * CHAR_FRAMES_PER_ROW || image.height < CHAR_FRAME_H * CHAR_DIRECTIONS.length) {
        console.warn(
          `[CouncilRoom] Skipping characters/char_${index}.png due to unexpected size ${image.width}x${image.height}`,
        )
        continue
      }

      const pixelData = imageToPixelData(image)
      const directionSprites = {
        down: [],
        up: [],
        right: [],
      } as CharacterDirectionSprites

      for (let directionIndex = 0; directionIndex < CHAR_DIRECTIONS.length; directionIndex += 1) {
        const direction = CHAR_DIRECTIONS[directionIndex]
        const rowOffsetY = directionIndex * CHAR_FRAME_H
        const frames: SpriteData[] = []
        for (let frameIndex = 0; frameIndex < CHAR_FRAMES_PER_ROW; frameIndex += 1) {
          const offsetX = frameIndex * CHAR_FRAME_W
          frames.push(pixelDataToSprite(pixelData, offsetX, rowOffsetY, CHAR_FRAME_W, CHAR_FRAME_H))
        }
        directionSprites[direction] = frames
      }

      characters.push(directionSprites)
    } catch {
      // Missing character files are expected during fallback scenarios.
      break
    }
  }

  return characters.length > 0 ? characters : null
}

async function loadCouncilRoomAssets(assetBaseUrl: string): Promise<CouncilRoomAssetLoadResult> {
  const [furnitureAssets, characterSprites] = await Promise.all([
    fetchFurnitureAssets(assetBaseUrl),
    fetchCharacterSprites(assetBaseUrl),
  ])

  let customFurnitureApplied = false
  if (furnitureAssets) {
    customFurnitureApplied = buildDynamicCatalog(furnitureAssets)
  }

  let characterSpritesApplied = false
  let loadedCharacterCount = 0
  if (characterSprites) {
    setCharacterTemplates(characterSprites)
    characterSpritesApplied = true
    loadedCharacterCount = characterSprites.length
  }

  return {
    customFurnitureApplied,
    characterSpritesApplied,
    loadedCharacterCount,
  }
}

export function preloadCouncilRoomAssets(assetBaseUrl = DEFAULT_ASSET_BASE_URL): Promise<CouncilRoomAssetLoadResult> {
  const normalizedBaseUrl = normalizeAssetBaseUrl(assetBaseUrl)
  const existing = loadPromiseByBaseUrl.get(normalizedBaseUrl)
  if (existing) {
    return existing
  }

  const promise = loadCouncilRoomAssets(normalizedBaseUrl)
    .catch((error) => {
      console.warn('[CouncilRoom] Asset preload failed, continuing with fallback sprites:', error)
      loadPromiseByBaseUrl.delete(normalizedBaseUrl)
      return {
        customFurnitureApplied: false,
        characterSpritesApplied: false,
        loadedCharacterCount: 0,
      } satisfies CouncilRoomAssetLoadResult
    })

  loadPromiseByBaseUrl.set(normalizedBaseUrl, promise)
  return promise
}
