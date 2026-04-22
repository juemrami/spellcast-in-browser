import { Context, Effect, identity, Layer, pipe, Random } from "effect"
import { defined } from "effect/Match"
import type { Board, Tile } from "../types/game"
import { BoggleSolver } from "./BoggleSolver"
import { LetterFrequencyAnalyzer } from "./WordList"
const MAX_GEN_FALLBACK = 1000
const make = Effect.gen(function*() {
	const analyzer = yield* LetterFrequencyAnalyzer
	const solver = yield* BoggleSolver
	return {
		generate: Effect.fn(function*(boardSize: number, options: {
			maxOccurrencesPerLetter?: number
			maxGenAttempts?: number
			minAvgWordLength?: number
			minWordLength?: number
			/** Inclusive range */
			totalWordsRange?: [min: number, max: number]
			seed?: string | number | undefined
		} = {}) {
			const freshBoard = Effect.gen(function*() {
				const letters = yield* pipe(
					analyzer.sample(boardSize * boardSize, options),
					defined(options.seed) ? Random.withSeed(options.seed) : identity
				)
				const board = []
				for (let row = 0; row < boardSize; row++) {
					for (let col = 0; col < boardSize; col++) {
						board.push(
							{
								row,
								col,
								letter: letters[row * boardSize + col],
								type: "normal"
							} satisfies Tile
						)
					}
				}
				return board as Board
			})
			let board = yield* freshBoard
			if (options.minAvgWordLength || options.totalWordsRange) {
				for (let attempt = 0; attempt < (options.maxGenAttempts ?? MAX_GEN_FALLBACK); attempt++) {
					if (attempt === (options.maxGenAttempts ?? MAX_GEN_FALLBACK) - 1) {
						console.warn("Max board generation attempts reached")
						break
					}
					const solutions = yield* solver.solve(board, {
						minWordLength: options.minWordLength
					})
					const solutionMeta = yield* solver.analyzeSolution(solutions)
					const avgWordLength = solutionMeta.avgWordLength
					const totalWords = solutionMeta.totalWords
					if (options.minAvgWordLength && avgWordLength < options.minAvgWordLength) {
						board = yield* freshBoard
						continue
					}
					if (options.totalWordsRange) {
						const [min, max] = options.totalWordsRange
						if (totalWords < min || totalWords > max) {
							board = yield* freshBoard
							continue
						}
					}
					console.log(
						`Board generated in ${
							attempt + 1
						} attempts with avg word length ${avgWordLength} and total words ${totalWords}`
					)
					break
				}
			}
			return {
				board,
				solutions: yield* solver.solve(board, {
					minWordLength: options.minWordLength
				})
			}
		})
	}
})

export class BoardGenerator extends Context.Service<BoardGenerator>()("host/BoardGeneratorService", {
	make
}) {
	static layer = Layer.effect(BoardGenerator, make)
	static live = Layer.provide(
		Layer.effect(BoardGenerator, make),
		Layer.mergeAll(LetterFrequencyAnalyzer.layer, BoggleSolver.layer)
	)
}

export const generate = (...args: Parameters<typeof BoardGenerator.Service.generate>) =>
	BoardGenerator.use((service) => service.generate(...args))
