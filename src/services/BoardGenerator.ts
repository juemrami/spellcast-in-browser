import { Context, Effect, Layer } from "effect"
import type { Board, Tile } from "../types/game"
import { LetterFrequencyAnalyzer } from "./WordList"

const make = Effect.gen(function*() {
	const analyzer = yield* LetterFrequencyAnalyzer
	return {
		generate: Effect.fn(function*(boardSize: number, options: {
			maxOccurrencesPerLetter?: number
		} = {}) {
			const letters = yield* analyzer.sample(boardSize * boardSize, options)
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
	}
})

export class BoardGenerator extends Context.Service<BoardGenerator>()("app/BoardGeneratorService", {
	make
}) {
	static layer = Layer.effect(BoardGenerator, make)
	static live = Layer.provide(Layer.effect(BoardGenerator, make), LetterFrequencyAnalyzer.layer)
}
