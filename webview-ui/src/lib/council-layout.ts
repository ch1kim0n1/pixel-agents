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
const RIGHT_PARTITION_COL = 15
const RIGHT_SPLIT_ROW = 6

const OUTER_WALL_COLOR: FloorColor = { h: 224, s: 26, b: -22, c: 16 }
const INNER_WALL_COLOR: FloorColor = { h: 221, s: 20, b: -28, c: 22 }
const WAR_ROOM_FLOOR_COLOR: FloorColor = { h: 30, s: 46, b: 10, c: 10 }
const SUPPORT_FLOOR_COLOR: FloorColor = { h: 36, s: 14, b: 36, c: -6, colorize: true }
const LOUNGE_FLOOR_COLOR: FloorColor = { h: 207, s: 34, b: -4, c: 4 }

interface CouncilFurnitureTypes {
  chairmanDesk: string
  memberDeskA: string
  memberDeskB: string
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
    chairmanDesk: pickFurnitureType(
      ['jik-office-boss-desk', 'jik-office-desk', 'jik-office-desk-2'],
      FurnitureType.DESK,
      'desks',
    ),
    memberDeskA: pickFurnitureType(
      ['jik-office-desk', 'jik-office-desk-2', 'jik-office-boss-desk'],
      FurnitureType.DESK,
      'desks',
    ),
    memberDeskB: pickFurnitureType(
      ['jik-office-desk-2', 'jik-office-desk', 'jik-office-boss-desk'],
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

  const setWall = (col: number, row: number, color = INNER_WALL_COLOR) => {
    const index = tileIndex(col, row)
    tiles[index] = TileType.WALL
    tileColors[index] = color
  }

  for (let row = 1; row < ROWS - 1; row += 1) {
    for (let col = 1; col < COLS - 1; col += 1) {
      setFloor(col, row, TileType.FLOOR_2, WAR_ROOM_FLOOR_COLOR)
    }
  }

  for (let row = 1; row <= 5; row += 1) {
    for (let col = 16; col <= 22; col += 1) {
      setFloor(col, row, TileType.FLOOR_1, SUPPORT_FLOOR_COLOR)
    }
  }

  for (let row = 7; row <= 15; row += 1) {
    for (let col = 16; col <= 22; col += 1) {
      setFloor(col, row, TileType.FLOOR_3, LOUNGE_FLOOR_COLOR)
    }
  }

  for (let row = 1; row < ROWS - 1; row += 1) {
    if (row !== 3 && row !== 12) {
      setWall(RIGHT_PARTITION_COL, row)
    }
  }

  for (let col = 16; col <= 22; col += 1) {
    if (col !== 18) {
      setWall(col, RIGHT_SPLIT_ROW)
    }
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

  // Main wall dressing.
  place('board-main', types.board, 8, 0)
  place('note-main-west', types.note, 6, 0)
  place('note-main-east', types.note, 10, 0)
  place('clock-pantry', types.clock, 21, 0)
  place('painting-lounge', types.painting, 20, 6)

  // Left office room.
  place('shelf-west-a', types.shelf, 2, 1)
  place('shelf-west-b', types.shelf, 4, 1)
  place('shelf-east-a', types.shelf, 9, 1)
  place('shelf-east-b', types.shelf, 11, 1)
  place('plant-west-top', types.plantBig, 1, 3)
  place('plant-west-bottom', types.plantSmall, 1, 14)
  place('plant-east-bottom', types.plantSmall, 13, 14)
  place('storage-west', types.storage, 1, 11)
  place('storage-east', types.storage, 12, 14)

  place('desk-chairman', types.chairmanDesk, 7, 4)
  place(chairmanSeatId, types.chairmanChair, 8, 6)

  place('desk-member-nw', types.memberDeskA, 2, 6)
  placeMemberSeat('chair-member-1', 3, 8)

  place('desk-member-ne', types.memberDeskB, 8, 6)
  placeMemberSeat('chair-member-2', 9, 8)

  place('desk-member-sw', types.memberDeskB, 2, 10)
  placeMemberSeat('chair-member-3', 3, 12)

  place('desk-member-se', types.memberDeskA, 8, 10)
  placeMemberSeat('chair-member-4', 9, 12)

  place('desk-member-east-north', types.memberDeskA, 11, 6)
  placeMemberSeat('chair-member-5', 12, 8)

  place('desk-member-east-south', types.memberDeskB, 11, 10)
  placeMemberSeat('chair-member-6', 12, 12)

  // Pantry / utility room.
  place('vending', types.vending, 16, 1)
  place('water', types.waterDispenser, 18, 1)
  place('counter', types.counter, 20, 1)
  place('printer-pantry', types.printer, 16, 4)
  place('coffee', types.coffeeMachine, 20, 4)
  place('note-pantry', types.note, 18, 0)

  // Lower-right lounge / consult room.
  place('lounge-shelf-west', types.shelf, 16, 8)
  place('lounge-shelf-east', types.shelf, 21, 8)
  place('lounge-plant-west', types.plantSmall, 17, 10)
  place('lounge-plant-east', types.plantSmall, 20, 10)
  place('lounge-table', types.sideTable, 19, 11)
  place('lounge-sofa-west', types.sofa, 17, 12)
  place('lounge-sofa-east', types.sofa, 20, 12)

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
