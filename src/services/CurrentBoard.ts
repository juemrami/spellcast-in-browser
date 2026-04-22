import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"

import { Cache, Match, Ref, String } from "effect"
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
			const getLetterScore = (letter: EnglishUpperLetter) =>
				Match.value(options).pipe(
					Match.when(
						{ type: "letter-points" },
						({ system }) => letterPointScoreLookup[system][letter] || 0
					),
					Match.when({ type: "word-length" }, () => {
						// eslint-disable-next-line no-console
						console.log("Word length scoring calculated by length of word, ignoring letter values")
						return 0
					}),
					Match.exhaustive
				)
			// note if theres ever scoring pased on positional and row/col is required. refactor this or dont cache
			const pathToScoreKey = (path: Array<Tile>): string => path.map((tile) => tile.letter).join("")
			const scoreKeyToLetterArray = (key: string): Array<EnglishUpperLetter> =>
				key.split("").map((char) => String.toUpperCase(char) as EnglishUpperLetter)
			/** doesn't include an tile specific bonuses */
			const wordScoreCache = yield* Cache.make({
				capacity: 1_000,
				lookup: (key: string) =>
					Effect.gen(
						function*() {
							const letters = scoreKeyToLetterArray(key)
							let score = letters.reduce((acc, letter) => acc + getLetterScore(letter), 0)
							return score
						}
					)
			})
			return {
				// todo: account for Tile.type multipliers or additions
				getTileScore: (tile: Tile) => getLetterScore(String.toUpperCase(tile.letter)),
				getPathScore: Effect.fn(function*(path: Array<Tile>) {
					return yield* Cache.get(wordScoreCache, pathToScoreKey(path))
				})
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
	const regenerateBoard = Effect.fn(function*(seed?: string | number) {
		return yield* pipe(
			generateBoard(seed),
			Effect.tap((generation) => Ref.set(generationRef, generation))
		)
	})
	const boardSolutions = Ref.get(generationRef).pipe(Effect.map((board) => board.solutions))
	const boardTiles = Ref.get(generationRef).pipe(Effect.map((board) => board.board))
	const isValidPath = Effect.fn(function*(path: Array<Tile>) {
		const solutions = yield* boardSolutions
		// validate that the path tiles exists and the letter match
		for (const tile of path) {
			const matchingTile = (yield* boardTiles).find((t) => t.col === tile.col && t.row === tile.row)
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
	return {
		regenerateBoard,
		boardSolutions,
		scoring: {
			// todo: maybe dont expose this here, and make consumers use the scoring service directly for this? idk
			...yield* ScoringService,
			isValidPath
		},
		atoms: {
			board: Atom.make(() => boardTiles),
			tileCount: Atom.make(() => Effect.map(boardTiles, (tiles) => tiles.length))
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
