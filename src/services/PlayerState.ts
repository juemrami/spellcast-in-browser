import { Effect, Layer } from "effect"
import * as Context from "effect/Context"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Tile } from "../types/game"

const areTilesAdjacent = (tileA: Tile, tileB: Tile): boolean => {
	const rowDiff = Math.abs(tileA.row - tileB.row)
	const colDiff = Math.abs(tileA.col - tileB.col)
	return rowDiff <= 1 && colDiff <= 1
}
export class PlayerGameState extends Context.Service<PlayerGameState>()("spellcast/PlayerGameState", {
	make: Effect.gen(function*() {
		const selectionPath = Atom.make([] as Array<Tile>)
		const tryUpdateSelectionPath = Atom.fn(Effect.fn(function*(tile: Tile, get: Atom.FnContext) {
			const path = get(selectionPath)
			if (path.some((t) => t.row === tile.row && t.col === tile.col)) return false
			if (path.length === 0 || areTilesAdjacent(path[path.length - 1], tile)) {
				get.set(selectionPath, [...path, tile])
				console.log("Updated selection path:", get(selectionPath))
				return true
			}
			return false
		}))
		return {
			selectionPath,
			tryUpdateSelectionPath
		}
	})
}) {
	static layerFresh = Layer.fresh(Layer.effect(this, this.make))
}
