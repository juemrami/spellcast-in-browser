import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"

import { pipe } from "effect/Function"
import { type Board, BOARD_SIZE, type Tile } from "../types/game"

type ScoringType = "letter-points" | "word-length"
const letterPointScores = {
	// points: [letters]
	spellShake: {
		1: ["A", "E", "I", "O", "U", "L", "N", "S", "T", "R"],
		2: ["D", "G"],
		3: ["B", "C", "M", "P"],
		4: ["F", "H", "V", "W", "Y"],
		5: ["K"],
		8: ["J", "X"],
		10: ["Q", "Z"]
	} as const,
	spellCast: {
		1: ["A", "E", "I", "O"],
		2: ["N", "S", "T", "R"],
		3: ["D", "G", "L"],
		4: ["B", "H", "P", "M", "U", "Y"],
		5: ["C", "F", "V", "W"],
		6: ["K"],
		7: ["J", "X"],
		8: ["Q", "Z"]
	} as const
} as const
type PointScoreSystem = keyof typeof letterPointScores
type Score = keyof typeof letterPointScores[PointScoreSystem]
type Letter = typeof letterPointScores[PointScoreSystem][Score][number]

const letterPointScoreLookup: Record<PointScoreSystem, Record<Letter, Score>> = pipe(
	Object.entries(
		letterPointScores
	).map(([system, scores]) => {
		// @ts-ignore
		const mappedScores: Record<Letter, Score> = {}
		Object.entries(scores).forEach(([points, letters]) => {
			letters.forEach(
				(
					letter: Letter
				) => {
					mappedScores[letter] = Number(points) as Score
				}
			)
		})
		return [system as PointScoreSystem, mappedScores] as const
	}),
	Object.fromEntries
)

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
	readonly getTileScore: (tile: Tile) => number
}>()("spellcast/BoardService") {}

export const make = Effect.sync(() => {
	const scoringType = "letter-points" as ScoringType
	const scoringMethod: keyof typeof letterPointScores = "spellCast"
	const tiles = Atom.make(createInitialBoard())
	const tileCount = Atom.make((get) => get(tiles).length)
	const getTileScore = (tile: Tile) => {
		if (scoringType === "word-length") {
			console.warn("Word length scoring not implemented yet, defaulting to 1 point per tile")
			return 1
		}
		const letterScoreLookup = letterPointScoreLookup[scoringMethod]
		return letterScoreLookup[tile.letter as Letter] || 0
	}
	return BoardService.of({
		tiles,
		tileCount,
		getTileScore
	})
})

export const layerFresh = Layer.fresh(Layer.effect(BoardService, make))
