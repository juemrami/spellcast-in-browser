import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"

import { Match, Ref, String } from "effect"
import { pipe } from "effect/Function"
import { BOARD_SIZE, type Tile } from "../types/game"
import { type BoardGeneration, BoardGenerator } from "./BoardGenerator"

const letterPointScores = {
	// points: [letters]
	wordShake: {
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

class ScoringService extends Context.Service<ScoringService>()(
	"shared/ScoringService",
	{
		make: Effect.fn(function*(
			options: {
				type: "letter-points"
				system: PointScoreSystem
			} | {
				type: "word-length"
			}
		) {
			const getTileScore = (tile: Tile) =>
				Match.value(options).pipe(
					Match.when(
						{ type: "letter-points" },
						({ system }) => letterPointScoreLookup[system][String.toUpperCase(tile.letter)] || 0
					),
					Match.when({ type: "word-length" }, () => {
						// eslint-disable-next-line no-console
						console.log("Word length scoring not implemented yet, defaulting to 1 point per tile")
						return 1
					}),
					Match.exhaustive
				)

			const getPathScore = (path: Array<Tile>) => path.reduce((score, tile) => score + getTileScore(tile), 0)
			return {
				getTileScore,
				getPathScore
			}
		})
	}
) {
	static getPathScore = (path: Array<Tile>) => this.use((s) => Effect.succeed(s.getPathScore(path)))
	static layer = (...args: Parameters<typeof this.make>) => Layer.effect(this, this.make(...args))
}

export const make = Effect.gen(function*() {
	const boardGenerator = yield* BoardGenerator
	const generateBoard = (seed?: string | number) =>
		boardGenerator.generate(BOARD_SIZE, {
			maxOccurrencesPerLetter: 4,
			minAvgWordLength: 4.5,
			minWordLength: 2,
			seed: seed
		})
	const EmptyBoard: BoardGeneration = {
		board: [],
		solutions: {
			words: new Set(),
			paths: []
		}
	}
	const generationRef = yield* Ref.make(EmptyBoard)
	const generationAtom = Atom.make(yield* Ref.get(generationRef))
	const regenerateBoard = Effect.fn(function*(seed?: string | number) {
		const newBoard = yield* generateBoard(seed)
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
	const boardAtom = Atom.make((get) => get(generationAtom).board)
	const tileCountAtom = Atom.make((get) => get(generationAtom).board.length)
	const regenerateBoardAtom = Atom.fn((seed: number | string | void) => regenerateBoard(seed ?? undefined))
	const boardSolutionsAtom = Atom.make((get) => get(generationAtom).solutions).pipe(Atom.keepAlive)
	const isValidPathAtom = Atom.fn(isValidPath)
	return {
		regenerateBoard,
		boardSolutions,
		isValidPath,
		// todo: maybe dont expose this here, and make consumers use the scoring service directly for this? idk
		getTileScore: (yield* ScoringService).getTileScore,
		atoms: {
			regenerateBoard: regenerateBoardAtom,
			boardSolutions: boardSolutionsAtom,
			board: boardAtom,
			isValidPath: isValidPathAtom,
			tileCount: tileCountAtom
		}
	}
})
// * Service for interacting with the currently generated board for the document runtime, assumes 1 game per document - 1 board per game*/
export class CurrentBoard
	extends Context.Service<CurrentBoard, Effect.Success<typeof make>>()("host/BoardGeneration")
{}
export const layer = Layer.effect(CurrentBoard, make)
export const live = Layer.provide(
	layer,
	Layer.mergeAll(BoardGenerator.live, ScoringService.layer({ type: "letter-points", system: "spellCast" }))
)
