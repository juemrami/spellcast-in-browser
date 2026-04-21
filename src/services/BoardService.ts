import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"

import { pipe } from "effect/Function"
import { toUpperCase } from "effect/String"
import { BOARD_SIZE, type Tile } from "../types/game"
import { BoardGenerator } from "./BoardGenerator"

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
type EnglishUpperLetter = typeof letterPointScores[PointScoreSystem][Score][number]

const letterPointScoreLookup: Record<PointScoreSystem, Record<EnglishUpperLetter, Score>> = pipe(
	Object.entries(
		letterPointScores
	).map(([system, scores]) => {
		// @ts-ignore
		const mappedScores: Record<EnglishUpperLetter, Score> = {}
		Object.entries(scores).forEach(([points, letters]) => {
			letters.forEach(
				(
					letter: EnglishUpperLetter
				) => {
					mappedScores[letter] = Number(points) as Score
				}
			)
		})
		return [system as PointScoreSystem, mappedScores] as const
	}),
	Object.fromEntries
)

export const make = Effect.gen(function*() {
	const scoringType = "letter-points" as ScoringType
	const scoringMethod: keyof typeof letterPointScores = "spellCast"
	const boardGenerator = yield* BoardGenerator
	const genNewBoard = boardGenerator.generate(BOARD_SIZE, {
		maxOccurrencesPerLetter: 4,
		minAvgWordLength: 4.5
	})
	const generation = yield* genNewBoard
	const lastGeneration = Atom.make(generation)
	const boardTiles = Atom.make((get) => get(lastGeneration).board)
	const tileCount = Atom.make((get) => get(lastGeneration).board.length)
	const regenerateBoard = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
		get.set(lastGeneration, yield* genNewBoard)
	}))
	const getTileScore = (tile: Tile) => {
		if (scoringType === "word-length") {
			// eslint-disable-next-line no-console
			console.log("Word length scoring not implemented yet, defaulting to 1 point per tile")
			return 1
		}
		const letterScoreLookup = letterPointScoreLookup[scoringMethod]
		return letterScoreLookup[toUpperCase(tile.letter)] || 0
	}
	const boardSolutions = Atom.make(Effect.fn(function*(get) {
		return get(lastGeneration).solutions
	})).pipe(Atom.keepAlive)
	const isValidPath = Atom.fn(Effect.fn(function*(path: Tile[], get: Atom.FnContext) {
		const solutions = yield* get.result(boardSolutions)
		const word = path.map((t) => t.letter).join("")
		return solutions.words.has(word.toLocaleLowerCase())
	}))
	return {
		boardTiles,
		tileCount,
		getTileScore,
		regenerateBoard,
		boardSolutions,
		isValidPath
	}
})
export class BoardService extends Context.Service<BoardService, Effect.Success<typeof make>>()("host/BoardService") {}
export const layer = Layer.effect(BoardService, make)
export const live = Layer.provide(layer, BoardGenerator.live)
