import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"
import { BoardService } from "./BoardService"
import { PlayerGameState } from "./PlayerState"

export class CurrentWordService extends Context.Service<CurrentWordService, {
	readonly word: Atom.Atom<string>
}>()("spellcast/CurrentWordService") {}

export const make = Effect.gen(function*() {
	const board = yield* BoardService
	const player = yield* PlayerGameState

	const currentWord = Atom.make((ctx) => {
		const tiles = ctx.get(board.tiles)
		const playerSelectionPath = ctx.get(player.selectionPath)
		const selectedTiles = playerSelectionPath.map((selected) =>
			tiles.find((tile) => tile.row === selected.row && tile.col === selected.col)
		)
		if (selectedTiles.some((tile) => tile === undefined)) {
			return ""
		}
		return selectedTiles.map((tile) => tile!.letter).join("")
	})

	return CurrentWordService.of({
		word: currentWord
	})
})

export const currentWordLayer = Layer.effect(CurrentWordService, make)
