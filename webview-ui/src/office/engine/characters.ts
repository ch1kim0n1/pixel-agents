import { CharacterState, CharacterWorkPose, Direction, TILE_SIZE } from '../types.js'
import type {
  Character,
  CharacterWorkPose as CharacterWorkPoseValue,
  Direction as DirectionValue,
  Seat,
  SpriteData,
  TileType as TileTypeVal,
} from '../types.js'
import type { CharacterSprites } from '../sprites/spriteData.js'
import { findPath } from '../layout/tileMap.js'
import {
  WALK_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
  TYPE_FRAME_DURATION_SEC,
  IDLE_FRAME_DURATION_SEC,
  IDLE_BREATHE_CYCLE_SEC,
  IDLE_BOB_AMPLITUDE_PX,
  TYPE_BOB_AMPLITUDE_PX,
  WALK_BOB_AMPLITUDE_PX,
  WALK_SWAY_AMPLITUDE_PX,
  WANDER_PAUSE_MIN_SEC,
  WANDER_PAUSE_MAX_SEC,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_MOVES_BEFORE_REST_MAX,
  SEAT_REST_MIN_SEC,
  SEAT_REST_MAX_SEC,
  WORK_POSE_MIN_SEC,
  WORK_POSE_MAX_SEC,
  THINK_POSE_MIN_SEC,
  THINK_POSE_MAX_SEC,
  SOCIAL_GLANCE_MIN_SEC,
  SOCIAL_GLANCE_MAX_SEC,
} from '../../constants.js'

const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'])

export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false
  return READING_TOOLS.has(tool)
}

function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  }
}

function directionBetween(fromCol: number, fromRow: number, toCol: number, toRow: number): DirectionValue {
  const dc = toCol - fromCol
  const dr = toRow - fromRow
  if (dc > 0) return Direction.RIGHT
  if (dc < 0) return Direction.LEFT
  if (dr > 0) return Direction.DOWN
  return Direction.UP
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function poseDuration(pose: CharacterWorkPoseValue): number {
  if (pose === CharacterWorkPose.THINKING) {
    return randomRange(THINK_POSE_MIN_SEC, THINK_POSE_MAX_SEC)
  }
  return randomRange(WORK_POSE_MIN_SEC, WORK_POSE_MAX_SEC)
}

function chooseWorkPose(ch: Character): CharacterWorkPoseValue {
  const readingBias = isReadingTool(ch.currentTool) || !ch.isActive
  const roll = Math.random()
  if (readingBias) {
    if (roll < 0.62) return CharacterWorkPose.READING
    if (roll < 0.88) return CharacterWorkPose.THINKING
    return CharacterWorkPose.TYPING
  }
  if (roll < 0.68) return CharacterWorkPose.TYPING
  if (roll < 0.88) return CharacterWorkPose.READING
  return CharacterWorkPose.THINKING
}

export function resetCharacterWorkPose(ch: Character, preferredPose?: CharacterWorkPoseValue): void {
  const pose = preferredPose ?? chooseWorkPose(ch)
  ch.workPose = pose
  ch.workPoseTimer = 0
  ch.workPoseDuration = poseDuration(pose)
}

export function triggerCharacterAttention(ch: Character, dir: DirectionValue, duration: number): void {
  if (ch.state === CharacterState.WALK) return
  ch.attentionDir = dir
  ch.attentionTimer = duration
  if (ch.state === CharacterState.TYPE) {
    resetCharacterWorkPose(ch, CharacterWorkPose.THINKING)
  }
}

export function getCharacterFacingDirection(ch: Character): DirectionValue {
  if (ch.state === CharacterState.WALK) return ch.dir
  return ch.attentionDir ?? ch.dir
}

export function getCharacterRenderOffset(ch: Character): { x: number; y: number } {
  let x = 0
  let y = 0
  const facingDir = getCharacterFacingDirection(ch)

  if (ch.state === CharacterState.WALK) {
    const stepArc = Math.sin(ch.moveProgress * Math.PI)
    const cadence = Math.sin(ch.moveProgress * Math.PI * 2)
    y -= stepArc * WALK_BOB_AMPLITUDE_PX
    if (ch.dir === Direction.LEFT || ch.dir === Direction.RIGHT) {
      x += cadence * WALK_SWAY_AMPLITUDE_PX
    } else {
      y += cadence * (WALK_SWAY_AMPLITUDE_PX * 0.35)
    }
  } else if (ch.state === CharacterState.IDLE) {
    const phase = (ch.idleTimer / IDLE_BREATHE_CYCLE_SEC) * Math.PI * 2 + ch.id * 0.37
    y += Math.sin(phase) * IDLE_BOB_AMPLITUDE_PX
  } else if (ch.state === CharacterState.TYPE) {
    const phase = ch.workPoseTimer * Math.PI * 2 + ch.id * 0.31
    if (ch.workPose === CharacterWorkPose.TYPING) {
      y += Math.sin(phase * 1.7) * TYPE_BOB_AMPLITUDE_PX
      x += Math.cos(phase * 0.85) * 0.25
    } else if (ch.workPose === CharacterWorkPose.READING) {
      y += Math.sin(phase * 0.7) * (TYPE_BOB_AMPLITUDE_PX * 0.55)
    } else {
      y += Math.sin(phase * 0.45) * (TYPE_BOB_AMPLITUDE_PX * 0.35)
    }
  }

  if (ch.attentionDir !== null && ch.attentionTimer > 0 && ch.state !== CharacterState.WALK) {
    if (facingDir === Direction.LEFT) x -= 0.5
    if (facingDir === Direction.RIGHT) x += 0.5
    if (facingDir === Direction.UP) y -= 0.35
    if (facingDir === Direction.DOWN) y += 0.2
  }

  return { x, y }
}

export function createCharacter(
  id: number,
  palette: number,
  seatId: string | null,
  seat: Seat | null,
  hueShift = 0,
): Character {
  const col = seat ? seat.seatCol : 1
  const row = seat ? seat.seatRow : 1
  const center = tileCenter(col, row)
  return {
    id,
    state: CharacterState.TYPE,
    dir: seat ? seat.facingDir : Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    idleTimer: Math.random() * IDLE_BREATHE_CYCLE_SEC,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    isActive: true,
    seatId,
    holdPosition: false,
    bubbleType: null,
    bubbleTimer: 0,
    seatTimer: 0,
    attentionDir: null,
    attentionTimer: 0,
    socialCooldown: randomRange(SOCIAL_GLANCE_MIN_SEC, SOCIAL_GLANCE_MAX_SEC),
    workPose: CharacterWorkPose.TYPING,
    workPoseTimer: 0,
    workPoseDuration: randomRange(WORK_POSE_MIN_SEC, WORK_POSE_MAX_SEC),
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
  }
}

function beginWalk(ch: Character, path: Array<{ col: number; row: number }>): void {
  ch.path = path
  ch.moveProgress = 0
  ch.state = CharacterState.WALK
  ch.frame = 0
  ch.frameTimer = 0
  ch.attentionDir = null
  ch.attentionTimer = 0
}

function beginIdle(ch: Character): void {
  ch.state = CharacterState.IDLE
  ch.frame = 0
  ch.frameTimer = 0
}

function beginType(ch: Character, preferredPose?: CharacterWorkPoseValue): void {
  ch.state = CharacterState.TYPE
  ch.frame = 0
  ch.frameTimer = 0
  ch.attentionDir = null
  ch.attentionTimer = 0
  resetCharacterWorkPose(ch, preferredPose)
}

export function updateCharacter(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  ch.idleTimer += dt
  if (ch.attentionTimer > 0) {
    ch.attentionTimer = Math.max(0, ch.attentionTimer - dt)
    if (ch.attentionTimer === 0) {
      ch.attentionDir = null
    }
  }
  ch.frameTimer += dt

  switch (ch.state) {
    case CharacterState.TYPE: {
      ch.workPoseTimer += dt
      if (ch.workPoseTimer >= ch.workPoseDuration) {
        resetCharacterWorkPose(ch)
      }

      const frameDuration =
        ch.workPose === CharacterWorkPose.THINKING
          ? TYPE_FRAME_DURATION_SEC * 1.8
          : ch.workPose === CharacterWorkPose.READING
            ? TYPE_FRAME_DURATION_SEC * 1.25
            : TYPE_FRAME_DURATION_SEC
      while (ch.frameTimer >= frameDuration) {
        ch.frameTimer -= frameDuration
        ch.frame = (ch.frame + 1) % 2
      }

      if (!ch.isActive) {
        if (ch.seatTimer > 0) {
          ch.seatTimer -= dt
          break
        }
        ch.seatTimer = 0
        beginIdle(ch)
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
        ch.wanderCount = 0
        ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX)
      }
      break
    }

    case CharacterState.IDLE: {
      while (ch.frameTimer >= IDLE_FRAME_DURATION_SEC) {
        ch.frameTimer -= IDLE_FRAME_DURATION_SEC
        ch.frame = (ch.frame + 1) % 2
      }
      if (ch.seatTimer < 0) ch.seatTimer = 0

      if (ch.isActive) {
        if (ch.holdPosition) {
          break
        }
        if (!ch.seatId) {
          beginType(ch)
          break
        }
        const seat = seats.get(ch.seatId)
        if (seat) {
          const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles)
          if (path.length > 0) {
            beginWalk(ch, path)
          } else {
            ch.dir = seat.facingDir
            beginType(ch)
          }
        }
        break
      }

      ch.wanderTimer -= dt
      if (ch.wanderTimer <= 0) {
        if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
          const seat = seats.get(ch.seatId)
          if (seat) {
            const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles)
            if (path.length > 0) {
              beginWalk(ch, path)
              break
            }
          }
        }
        if (walkableTiles.length > 0) {
          const target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)]
          const path = findPath(ch.tileCol, ch.tileRow, target.col, target.row, tileMap, blockedTiles)
          if (path.length > 0) {
            beginWalk(ch, path)
            ch.wanderCount++
          }
        }
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
      }
      break
    }

    case CharacterState.WALK: {
      while (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC
        ch.frame = (ch.frame + 1) % 4
      }

      if (ch.path.length === 0) {
        const center = tileCenter(ch.tileCol, ch.tileRow)
        ch.x = center.x
        ch.y = center.y

        if (ch.isActive) {
          if (ch.holdPosition) {
            beginIdle(ch)
            break
          }
          if (!ch.seatId) {
            beginType(ch)
          } else {
            const seat = seats.get(ch.seatId)
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.dir = seat.facingDir
              beginType(ch)
            } else {
              beginIdle(ch)
            }
          }
        } else {
          if (ch.seatId) {
            const seat = seats.get(ch.seatId)
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.dir = seat.facingDir
              beginType(ch, CharacterWorkPose.THINKING)
              if (ch.seatTimer < 0) {
                ch.seatTimer = 0
              } else {
                ch.seatTimer = randomRange(SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC)
              }
              ch.wanderCount = 0
              ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX)
              break
            }
          }
          beginIdle(ch)
          ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
        }
        break
      }

      const nextTile = ch.path[0]
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row)
      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt

      const fromCenter = tileCenter(ch.tileCol, ch.tileRow)
      const toCenter = tileCenter(nextTile.col, nextTile.row)
      const t = Math.min(ch.moveProgress, 1)
      const easedT = easeInOutQuad(t)
      ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * easedT
      ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * easedT

      if (ch.moveProgress >= 1) {
        ch.tileCol = nextTile.col
        ch.tileRow = nextTile.row
        ch.x = toCenter.x
        ch.y = toCenter.y
        ch.path.shift()
        ch.moveProgress = 0
      }

      if (ch.isActive && ch.seatId && !ch.holdPosition) {
        const seat = seats.get(ch.seatId)
        if (seat) {
          const lastStep = ch.path[ch.path.length - 1]
          if (!lastStep || lastStep.col !== seat.seatCol || lastStep.row !== seat.seatRow) {
            const newPath = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles)
            if (newPath.length > 0) {
              ch.path = newPath
              ch.moveProgress = 0
            }
          }
        }
      }
      break
    }
  }
}

export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  const facingDir = getCharacterFacingDirection(ch)
  switch (ch.state) {
    case CharacterState.TYPE:
      if (
        ch.workPose === CharacterWorkPose.READING
        || (isReadingTool(ch.currentTool) && ch.workPose !== CharacterWorkPose.TYPING)
        || (!ch.isActive && ch.workPose !== CharacterWorkPose.TYPING)
      ) {
        return sprites.reading[facingDir][ch.frame % 2]
      }
      if (ch.workPose === CharacterWorkPose.THINKING) {
        return sprites.reading[facingDir][0]
      }
      return sprites.typing[facingDir][ch.frame % 2]
    case CharacterState.WALK:
      return sprites.walk[ch.dir][ch.frame % 4]
    case CharacterState.IDLE:
      return sprites.walk[facingDir][ch.frame % 2 === 0 ? 1 : 2]
    default:
      return sprites.walk[facingDir][1]
  }
}
