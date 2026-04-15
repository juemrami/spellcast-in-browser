import * as Cache from "effect/Cache"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import type { AsyncResult } from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Tile } from "../types/game"
import { BoardService } from "./BoardService"
import { ClientPlayerState } from "./PlayerState"

const isValidWord = (word: string, wordList: Set<string>) => {
	if (typeof word === "string" && word.length > 0 && wordList.has(word)) {
		return true
	}
	return false
}

const getTilePathScore = (path: Array<Tile>) =>
	pipe(
		Effect.gen(
			function*() {
				const board = yield* BoardService
				let score = 0
				for (const tile of path) {
					score += board.getTileScore(tile)
				}
				return score
			}
		)
	)

export const make = Effect.gen(function*() {
	const board = yield* BoardService
	const player = yield* ClientPlayerState

	const currentWord = Atom.make((ctx) => {
		const tiles = ctx.get(board.boardTiles)
		const playerSelectionPath = ctx.get(player.selectionPath)
		const selectedTiles = playerSelectionPath.map((selected) =>
			tiles.find((tile) => tile.row === selected.row && tile.col === selected.col)
		)
		if (selectedTiles.some((tile) => tile === undefined)) {
			return ""
		}
		return selectedTiles.map((tile) => tile!.letter).join("")
	})
	const isCurrentWordValid = Atom.make((get) =>
		Effect.gen(function*() {
			const currentWordValue = get(currentWord)
			const solution = yield* get.result(board.boardSolutions)
			return isValidWord(currentWordValue, solution.words)
		})
	)
	const scoreCache = yield* Cache.make({
		capacity: 1_000,
		lookup: (key: string) => getTilePathScore(ketToPath(key))
	})
	const pathToKey = (path: Array<Tile>): string => JSON.stringify(path)
	const ketToPath = (key: string): Array<Tile> => JSON.parse(key)
	const currentWordScore = Atom.make((get) =>
		Effect.gen(function*() {
			const path = get(player.selectionPath)
			const score = yield* Cache.get(scoreCache, pathToKey(path))
			return score
		})
	)
	return CurrentWordService.of({
		word: currentWord,
		isCurrentWordValid,
		currentWordScore
	})
})

export class CurrentWordService extends Context.Service<CurrentWordService, {
	readonly word: Atom.Atom<string>
	readonly isCurrentWordValid: Atom.Atom<AsyncResult<boolean>>
	readonly currentWordScore: Atom.Atom<AsyncResult<number>>
}>()("spellcast/CurrentWordService") {
	static layer = Layer.effect(CurrentWordService, make)
}
