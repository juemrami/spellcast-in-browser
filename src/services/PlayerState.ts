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
			const tail = path.at(-1)
			// if no exiting path, select tile
			if (tail === undefined) {
				get.set(selectionPath, [tile])
				return true
			}
			// if re-selecting tail tile, unselect it
			if (tail?.row === tile.row && tail?.col === tile.col) {
				get.set(selectionPath, path.filter((t) => !(t.row === tile.row && t.col === tile.col)))
				return true
			}
			// if selecting other previously selected tile, do nothing
			if (path.some((t) => t.row === tile.row && t.col === tile.col)) {
				return false
			}
			// if selecting a tile adjacent to tail, select it
			if (areTilesAdjacent(tail, tile)) {
				get.set(selectionPath, [...path, tile])
				return true
			}
			// otherwise, do nothing
			return false
		}))
		const clearSelectionPath = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
			get.set(selectionPath, [])
		}))

		const isMouseDown = Atom.make((get) => {
			window.addEventListener("mousedown", () => get.setSelf(true))
			window.addEventListener("mouseup", () => get.setSelf(false))
			return false
		})
		type PlayerMeta = { id: string; name: string }
		const playerMeta = Atom.writable((ctx) => {
			const getStored = () => {
				const storedMeta = localStorage.getItem("playerMeta")
				return storedMeta ? JSON.parse(storedMeta) as PlayerMeta : undefined
			}
			const eventListener = () => ctx.setSelf(getStored())
			window.addEventListener("storage", eventListener)
			ctx.addFinalizer(() => window.removeEventListener("storage", eventListener))
			return getStored()
		}, (ctx, meta: PlayerMeta) => {
			localStorage.setItem("playerMeta", JSON.stringify(meta))
			ctx.setSelf(meta)
		})
		return {
			selectionPath,
			tryUpdateSelectionPath,
			clearSelectionPath,
			isMouseDown,
			playerMeta
		}
	})
}) {
	static layerFresh = Layer.fresh(Layer.effect(this, this.make))
}
