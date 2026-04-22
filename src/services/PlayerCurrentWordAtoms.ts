import * as Cache from "effect/Cache"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Tile } from "../types/game"
import { CurrentBoard } from "./CurrentBoard"
import { ClientPlayerState } from "./PlayerState"

export const make = Effect.gen(function*() {
	const board = yield* CurrentBoard
	const player = yield* ClientPlayerState

	const currentWord = Atom.make((ctx) => {
		const tiles = ctx.get(board.atoms.board)
		const playerSelectionPath = ctx.get(player.selectionPath)
		const selectedTiles = playerSelectionPath.map((selected) =>
			tiles.find((tile) => tile.row === selected.row && tile.col === selected.col)
		)
		if (selectedTiles.some((tile) => tile === undefined)) {
			return ""
		}
		return selectedTiles.map((tile) => tile!.letter).join("")
	})
	const isCurrentWordValid = Atom.make((get) => board.isValidPath(get(player.selectionPath)))
	const scoreCache = yield* Cache.make({
		capacity: 1_000,
		lookup: (key: string) =>
			Effect.gen(
				function*() {
					const path = ketToPath(key)
					let score = 0
					for (const tile of path) {
						score += board.getTileScore(tile)
					}
					return score
				}
			)
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
	return {
		word: currentWord,
		isCurrentWordValid,
		currentWordScore
	}
})

export class PlayerCurrentWordAtoms
	extends Context.Service<PlayerCurrentWordAtoms>()("spellcast/CurrentWordService", { make })
{
	static layer = Layer.effect(PlayerCurrentWordAtoms, make)
}
