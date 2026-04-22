import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"

import { Ref } from "effect"
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
	const genNewBoard = (seed?: string | number) =>
		boardGenerator.generate(BOARD_SIZE, {
			maxOccurrencesPerLetter: 4,
			minAvgWordLength: 4.5,
			minWordLength: 2,
			seed: seed
		})
	// todo: clean this up so im not wasting compute on this first generation
	const generationRef = yield* Ref.make(yield* genNewBoard(6969))
	const generationAtom = Atom.make(yield* Ref.get(generationRef))
	const regenerateBoard = Effect.fn(function*(seed?: string | number) {
		const newBoard = yield* genNewBoard(seed)
		yield* Ref.set(generationRef, newBoard)
		yield* Atom.set(generationAtom, newBoard)
	})
	const boardSolutions = Ref.get(generationRef).pipe(Effect.map((board) => board.solutions))
	const isValidPath = Effect.fn(function*(path: Array<Tile>) {
		const solutions = yield* boardSolutions
		// validate that the path tiles exists and the letter match
		for (const tile of path) {
			const boardTiles = yield* Ref.get(generationRef).pipe(Effect.map((board) => board.board))
			const matchingTile = boardTiles.find((t) => t.col === tile.col && t.row === tile.row)
			if (!matchingTile || matchingTile.letter !== tile.letter) {
				return false
			}
		}
		const word = path.map((t) => t.letter).join("").toLowerCase()
		if (!solutions.words.has(word)) {
			return false
		}
		return true
	})
	const getTileScore = (tile: Tile) => {
		if (scoringType === "word-length") {
			// eslint-disable-next-line no-console
			console.log("Word length scoring not implemented yet, defaulting to 1 point per tile")
			return 1
		}
		const letterScoreLookup = letterPointScoreLookup[scoringMethod]
		return letterScoreLookup[toUpperCase(tile.letter)] || 0
	}

	const boardAtom = Atom.make((get) => get(generationAtom).board)
	const tileCountAtom = Atom.make((get) => get(generationAtom).board.length)
	const regenerateBoardAtom = Atom.fn((seed: number | string | void) => regenerateBoard(seed ?? undefined))
	const boardSolutionsAtom = Atom.make((get) => get(generationAtom).solutions).pipe(Atom.keepAlive)
	const isValidPathAtom = Atom.fn(isValidPath)
	return {
		regenerateBoard,
		boardSolutions,
		getTileScore,
		isValidPath,
		atoms: {
			regenerateBoard: regenerateBoardAtom,
			boardSolutions: boardSolutionsAtom,
			board: boardAtom,
			isValidPath: isValidPathAtom,
			tileCount: tileCountAtom
		}
	}
})
export class BoardService extends Context.Service<BoardService, Effect.Success<typeof make>>()("host/BoardService") {}
export const layer = Layer.effect(BoardService, make)
export const live = Layer.provide(layer, BoardGenerator.live)
