export type TileType = "normal" | "gem" | "multiplier"

export interface Tile {
	readonly letter: string
	readonly row: number
	readonly col: number
	readonly type: TileType
}

export type Board = ReadonlyArray<Tile>
export type Path = Array<Tile>

export const BOARD_SIZE = 5
