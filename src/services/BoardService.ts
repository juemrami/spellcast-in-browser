import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"

import { type Board, BOARD_SIZE } from "../types/game"

const boardLetters = [
	"S",
	"P",
	"E",
	"L",
	"L",
	"C",
	"A",
	"S",
	"T",
	"E",
	"B",
	"O",
	"A",
	"R",
	"D",
	"T",
	"R",
	"A",
	"C",
	"E",
	"L",
	"I",
	"N",
	"E",
	"S"
] as const

const createInitialBoard = (): Board =>
	boardLetters.map((letter, index) => ({
		letter,
		row: Math.floor(index / BOARD_SIZE),
		col: index % BOARD_SIZE,
		type: "normal"
	}))

export class BoardService extends Context.Service<BoardService, {
	readonly tiles: Atom.Atom<Board>
	readonly tileCount: Atom.Atom<number>
}>()("spellcast/BoardService") {}

export const make = Effect.sync(() => {
	const tiles = Atom.make(createInitialBoard())
	const tileCount = Atom.make((get) => get(tiles).length)

	return BoardService.of({
		tiles,
		tileCount
	})
})

export const layerFresh = Layer.fresh(Layer.effect(BoardService, make))
