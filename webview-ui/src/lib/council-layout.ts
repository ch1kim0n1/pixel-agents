import { FurnitureType, TileType } from '../office/types.js'
import type { FloorColor, OfficeLayout, PlacedFurniture, TileType as TileTypeValue } from '../office/types.js'
import { getActiveCatalog, getCatalogEntry } from '../office/layout/furnitureCatalog.js'

export interface CouncilRoomLayoutSpec {
  layout: OfficeLayout
  chairmanSeatId: string
  memberSeatIds: string[]
}

const COLS = 24
const ROWS = 17

const OUTER_WALL_COLOR: FloorColor = { h: 224, s: 26, b: -22, c: 16 }
const INNER_WALL_COLOR: FloorColor = { h: 221, s: 20, b: -28, c: 22 }
const WAR_ROOM_FLOOR_COLOR: FloorColor = { h: 31, s: 48, b: 8, c: 8 }
const SUPPORT_FLOOR_COLOR: FloorColor = { h: 23, s: 20, b: 28, c: -4, colorize: true }
const LOUNGE_FLOOR_COLOR: FloorColor = { h: 11, s: 40, b: -18, c: 12, colorize: true }

interface CouncilFurnitureTypes {
  debateTable: string
  memberChair: string
  chairmanChair: string
  shelf: string
  storage: string
  printer: string
  vending: string
  waterDispenser: string
  coffeeMachine: string
  plantSmall: string
  plantBig: string
  board: string
  note: string
  clock: string
  sofa: string
  sideTable: string
  painting: string
  counter: string
}

function pickFurnitureType(
  candidates: string[],
  fallbackType: string,
  fallbackCategory?: string,
): string {
  for (const candidate of candidates) {
    if (getCatalogEntry(candidate)) {
      return candidate
    }
  }

  if (fallbackCategory) {
    const categoryCandidate = getActiveCatalog().find((entry) => entry.category === fallbackCategory)
    if (categoryCandidate) {
      return categoryCandidate.type
    }
  }

  if (getCatalogEntry(fallbackType)) {
    return fallbackType
  }

  return candidates[0] ?? fallbackType
}

function resolveCouncilFurnitureTypes(): CouncilFurnitureTypes {
  return {
    debateTable: pickFurnitureType(
      ['jik-office-big-round-table', 'jik-office-boss-desk', 'jik-office-desk'],
      FurnitureType.DESK,
      'desks',
    ),
    memberChair: pickFurnitureType(
      ['jik-office-chair', 'jik-office-chair-2', 'jik-office-boss-chair'],
      FurnitureType.CHAIR,
      'chairs',
    ),
    chairmanChair: pickFurnitureType(
      ['jik-office-chair-2', 'jik-office-chair', 'jik-office-boss-chair'],
      FurnitureType.CHAIR,
      'chairs',
    ),
    shelf: pickFurnitureType(
      ['jik-office-tall-bookshelf', 'jik-office-bookshelf', 'jik-office-wall-shelf'],
      FurnitureType.BOOKSHELF,
      'storage',
    ),
    storage: pickFurnitureType(
      ['jik-office-wide-filing-cabinet', 'jik-office-big-filing-cabinet', 'jik-office-filing-cabinet-small'],
      FurnitureType.BOOKSHELF,
      'storage',
    ),
    printer: pickFurnitureType(
      ['jik-office-printer', 'jik-office-big-office-printer', 'jik-office-printer-furniture'],
      FurnitureType.PC,
      'electronics',
    ),
    vending: pickFurnitureType(
      ['jik-office-vending-machine', 'jik-office-printer-furniture'],
      FurnitureType.PC,
      'electronics',
    ),
    waterDispenser: pickFurnitureType(
      ['jik-office-water-dispenser', 'jik-office-printer'],
      FurnitureType.COOLER,
      'electronics',
    ),
    coffeeMachine: pickFurnitureType(
      ['jik-office-coffee-machine', 'jik-office-printer'],
      FurnitureType.PC,
      'electronics',
    ),
    plantSmall: pickFurnitureType(
      ['jik-office-small-plant', 'jik-office-big-plant'],
      FurnitureType.PLANT,
      'decor',
    ),
    plantBig: pickFurnitureType(
      ['jik-office-big-plant', 'jik-office-small-plant'],
      FurnitureType.PLANT,
      'decor',
    ),
    board: pickFurnitureType(
      ['jik-office-wall-graph', 'jik-office-board', 'jik-office-wall-note'],
      FurnitureType.WHITEBOARD,
      'wall',
    ),
    note: pickFurnitureType(
      ['jik-office-wall-note', 'jik-office-wall-note-2', 'jik-office-mirror'],
      FurnitureType.LAMP,
      'wall',
    ),
    clock: pickFurnitureType(
      ['jik-office-wall-clock', 'jik-office-mirror'],
      FurnitureType.LAMP,
      'wall',
    ),
    sofa: pickFurnitureType(
      ['jik-office-small-sofa', 'jik-office-big-sofa', 'jik-office-big-sofa-2'],
      FurnitureType.COOLER,
      'misc',
    ),
    sideTable: pickFurnitureType(
      ['jik-office-small-table', 'jik-office-desk', 'jik-office-desk-2'],
      FurnitureType.DESK,
      'desks',
    ),
    painting: pickFurnitureType(
      ['fpack-home-paintings-003', 'fpack-home-paintings-006', 'jik-office-wall-graph'],
      FurnitureType.WHITEBOARD,
      'wall',
    ),
    counter: pickFurnitureType(
      ['jik-office-wide-filing-cabinet', 'jik-office-big-filing-cabinet', 'jik-office-printer-furniture'],
      FurnitureType.BOOKSHELF,
      'storage',
    ),
  }
}

function tileIndex(col: number, row: number): number {
  return row * COLS + col
}

function buildTilesAndColors(): {
  tiles: TileTypeValue[]
  tileColors: Array<FloorColor | null>
} {
  const tiles = new Array<TileTypeValue>(COLS * ROWS).fill(TileType.WALL)
  const tileColors = new Array<FloorColor | null>(COLS * ROWS).fill(OUTER_WALL_COLOR)

  const setFloor = (
    col: number,
    row: number,
    tile: TileTypeValue,
    color: FloorColor,
  ) => {
    const index = tileIndex(col, row)
    tiles[index] = tile
    tileColors[index] = color
  }

  for (let row = 1; row < ROWS - 1; row += 1) {
    for (let col = 1; col < COLS - 1; col += 1) {
      setFloor(col, row, TileType.FLOOR_2, WAR_ROOM_FLOOR_COLOR)
    }
  }

  for (let col = 1; col < COLS - 1; col += 1) {
    setFloor(col, 1, TileType.FLOOR_1, SUPPORT_FLOOR_COLOR)
    setFloor(col, ROWS - 2, TileType.FLOOR_1, SUPPORT_FLOOR_COLOR)
  }

  for (let row = 1; row < ROWS - 1; row += 1) {
    setFloor(1, row, TileType.FLOOR_1, SUPPORT_FLOOR_COLOR)
    setFloor(COLS - 2, row, TileType.FLOOR_1, SUPPORT_FLOOR_COLOR)
  }

  for (let row = 5; row <= 12; row += 1) {
    for (let col = 8; col <= 15; col += 1) {
      setFloor(col, row, TileType.FLOOR_3, LOUNGE_FLOOR_COLOR)
    }
  }

  for (let col = 10; col <= 13; col += 1) {
    setFloor(col, 2, TileType.FLOOR_5, SUPPORT_FLOOR_COLOR)
    setFloor(col, 13, TileType.FLOOR_5, SUPPORT_FLOOR_COLOR)
  }

  return { tiles, tileColors }
}

function buildFurniture(): {
  furniture: PlacedFurniture[]
  chairmanSeatId: string
  memberSeatIds: string[]
} {
  const furniture: PlacedFurniture[] = []
  const memberSeatIds: string[] = []
  const types = resolveCouncilFurnitureTypes()

  const place = (uid: string, type: string, col: number, row: number) => {
    furniture.push({ uid, type, col, row })
  }

  const placeMemberSeat = (uid: string, col: number, row: number) => {
    memberSeatIds.push(uid)
    place(uid, types.memberChair, col, row)
  }

  const chairmanSeatId = 'chair-chairman'

  // Wall dressing.
  place('board-main', types.board, 11, 0)
  place('note-main-west', types.note, 9, 0)
  place('note-main-east', types.note, 13, 0)
  place('clock-main', types.clock, 20, 0)
  place('painting-main', types.painting, 3, 0)

  // Debate room storage + utilities around the perimeter.
  place('shelf-north-west', types.shelf, 2, 2)
  place('shelf-north-east', types.shelf, 19, 2)
  place('storage-south-west', types.storage, 2, 13)
  place('storage-south-east', types.storage, 19, 13)
  place('plant-north-west', types.plantBig, 1, 5)
  place('plant-north-east', types.plantBig, 21, 5)
  place('plant-south-west', types.plantSmall, 1, 14)
  place('plant-south-east', types.plantSmall, 22, 14)
  place('vending', types.vending, 4, 13)
  place('water', types.waterDispenser, 7, 13)
  place('counter', types.counter, 14, 13)
  place('printer', types.printer, 17, 13)
  place('coffee', types.coffeeMachine, 18, 13)
  place('lounge-sofa-west', types.sofa, 2, 9)
  place('lounge-sofa-east', types.sofa, 20, 9)
  place('lounge-side-table-west', types.sideTable, 4, 10)
  place('lounge-side-table-east', types.sideTable, 19, 10)

  // Central debate table.
  place('debate-table-nw', types.debateTable, 10, 7)
  place('debate-table-ne', types.debateTable, 12, 7)
  place('debate-table-sw', types.debateTable, 10, 9)
  place('debate-table-se', types.debateTable, 12, 9)

  // Core council seating (chairman + six members).
  placeMemberSeat('chair-member-1', 10, 6)
  placeMemberSeat('chair-member-2', 12, 6)
  placeMemberSeat('chair-member-3', 9, 8)
  placeMemberSeat('chair-member-4', 9, 9)
  placeMemberSeat('chair-member-5', 14, 8)
  placeMemberSeat('chair-member-6', 12, 11)
  place(chairmanSeatId, types.chairmanChair, 11, 11)

  // Extra seats to keep the room populated for larger councils and subagents.
  place('chair-guest-1', types.memberChair, 11, 6)
  place('chair-guest-2', types.memberChair, 13, 6)
  place('chair-guest-3', types.memberChair, 10, 11)
  place('chair-guest-4', types.memberChair, 13, 11)

  return { furniture, chairmanSeatId, memberSeatIds }
}

export function createCouncilRoomLayout(): CouncilRoomLayoutSpec {
  const { tiles, tileColors } = buildTilesAndColors()
  const { furniture, chairmanSeatId, memberSeatIds } = buildFurniture()
  return {
    layout: {
      version: 1,
      cols: COLS,
      rows: ROWS,
      tiles,
      tileColors,
      furniture,
    },
    chairmanSeatId,
    memberSeatIds,
  }
}

export const COUNCIL_LAYOUT_THEME = {
  outerWallColor: OUTER_WALL_COLOR,
  innerWallColor: INNER_WALL_COLOR,
  warRoomFloorColor: WAR_ROOM_FLOOR_COLOR,
  supportFloorColor: SUPPORT_FLOOR_COLOR,
  loungeFloorColor: LOUNGE_FLOOR_COLOR,
}
