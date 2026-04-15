import { Data, Effect, Layer } from "effect"
import * as Context from "effect/Context"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Tile } from "../types/game"
import type { GameStateAction } from "./GameState"
import * as GameState from "./GameState"

const areTilesAdjacent = (tileA: Tile, tileB: Tile): boolean => {
	const rowDiff = Math.abs(tileA.row - tileB.row)
	const colDiff = Math.abs(tileA.col - tileB.col)
	return rowDiff <= 1 && colDiff <= 1
}
export class ClientPlayerState extends Context.Service<ClientPlayerState>()("app/PlayerClientState", {
	make: Effect.gen(function*() {
		const selectionPath = Atom.make([] as Array<Tile>)
		const { state: currentGame } = yield* GameState.GameState
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
		const upsertDefaultPlayerMeta = () => {
			const defaultMeta = {
				id: crypto.randomUUID(),
				name: `Player-${Math.floor(Math.random() * 1000)}`
			}
			localStorage.setItem("playerMeta", JSON.stringify(defaultMeta))
			return defaultMeta
		}
		const playerMeta = Atom.writable((ctx) => {
			const getStored = () => {
				const storedMeta = localStorage.getItem("playerMeta")
				if (!storedMeta) return upsertDefaultPlayerMeta()
				try {
					const parsed = JSON.parse(storedMeta) as PlayerMeta
					if (typeof parsed.id === "string" && typeof parsed.name === "string") {
						return parsed
					}
					return upsertDefaultPlayerMeta()
				} catch {
					return upsertDefaultPlayerMeta()
				}
			}
			const eventListener = () => ctx.setSelf(getStored())
			window.addEventListener("storage", eventListener)
			ctx.addFinalizer(() => window.removeEventListener("storage", eventListener))
			return getStored()
		}, (ctx, meta: PlayerMeta) => {
			localStorage.setItem("playerMeta", JSON.stringify(meta))
			ctx.setSelf(meta)
		})
		const playerName = Atom.writable((get) => {
			const meta = get(playerMeta)
			return meta.name
		}, (ctx, name: string) => {
			const trimmedName = name.trim()
			if (trimmedName.length === 0) {
				return
			}
			const meta = { ...ctx.get(playerMeta), name: trimmedName }
			ctx.set(playerMeta, meta)
			ctx.setSelf(trimmedName)
		})
		const { joinLobby } = Data.taggedEnum<GameStateAction>()
		const joinCurrentGameLobby = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
			let meta = get(playerMeta)
			const trimmedName = meta.name.trim()
			if (trimmedName.length === 0) {
				const newName = `Player-${Math.floor(Math.random() * 1000)}`
				meta = { ...meta, name: newName }
				get.set(playerMeta, meta)
			}
			get.set(currentGame, joinLobby({ player: meta }))
		}))
		const playerId = Atom.readable((get) => get(playerMeta).id)
		return {
			selectionPath,
			tryUpdateSelectionPath,
			clearSelectionPath,
			isMouseDown,
			meta: {
				playerName,
				playerId
			},
			joinCurrentGameLobby
		}
	})
}) {
	static layerFresh = Layer.fresh(Layer.effect(this, this.make))
}
