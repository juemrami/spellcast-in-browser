import { layerLocalStorage } from "@effect/platform-browser/BrowserKeyValueStore"
import { Effect, Layer, pipe, Random, Schema } from "effect"
import * as Context from "effect/Context"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Tile } from "../types/game"
import { CurrentBoard } from "./CurrentBoard"
import { GameMatchAction, GameState, GameStateMachine, isActiveTurnState } from "./GameStateMachine"

const areTilesAdjacent = (tileA: Tile, tileB: Tile): boolean => {
	const rowDiff = Math.abs(tileA.row - tileB.row)
	const colDiff = Math.abs(tileA.col - tileB.col)
	return rowDiff <= 1 && colDiff <= 1
}

const makeDefaultPlayerName = (): string => {
	return `Player-${Math.floor(Math.random() * 1000)}`
}

const PlayerIdentity = Schema.Struct({
	id: Schema.String.pipe(Schema.check(Schema.isUUID(4))),
	name: Schema.String
}).pipe(Schema.fromJsonString)

const localStorageAtomRuntime = Atom.runtime(layerLocalStorage)

type AtomArg<Fn> = Fn extends Atom.AtomResultFn<infer Args, infer _, infer _> ? Args : never
export class ClientPlayerState extends Context.Service<ClientPlayerState>()("app/PlayerClientState", {
	make: Effect.gen(function*() {
		const selectionPath = Atom.make([] as Array<Tile>)
		const { atom: currentGame, dispatch: actionDispatch } = yield* GameStateMachine
		const { scoring: { isValidPath, getPathScore } } = yield* CurrentBoard
		const useAction = Effect.fn(function*(get: Atom.FnContext, action: AtomArg<typeof actionDispatch>) {
			get.set(actionDispatch, action)
			return yield* get.result(actionDispatch)
		})
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
		const currentWordScore = Atom.make((get) => pipe(get(selectionPath), getPathScore))
		const currentWord = Atom.make((ctx) => ctx.get(selectionPath).map((tile) => tile!.letter).join(""))
		const isCurrentWordValid = Atom.make((get) => isValidPath(get(selectionPath)))
		const isMouseDown = Atom.make((get) => {
			window.addEventListener("mousedown", () => get.setSelf(true))
			window.addEventListener("mouseup", () => get.setSelf(false))
			return false
		})
		// note: doesnt subscribe to x-tab storage events
		const playerMeta = Atom.kvs({
			key: "playerMeta",
			schema: PlayerIdentity,
			defaultValue: () =>
				Effect.runSync(Effect.gen(function*() {
					const id = yield* Random.nextUUIDv4
					return { id, name: makeDefaultPlayerName() }
				})),
			runtime: localStorageAtomRuntime
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
		const joinCurrentGameLobby = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
			let meta = get(playerMeta)
			const trimmedName = meta.name.trim()
			if (trimmedName.length === 0) {
				const newName = makeDefaultPlayerName()
				meta = { ...meta, name: newName }
				get.set(playerMeta, meta)
			}
			return yield* useAction(get, GameMatchAction.joinLobby({ player: meta }))
		}))
		const playerId = Atom.readable((get) => get(playerMeta).id)
		const setMatchConfig = Atom.fn(Effect.fn(function*(numRounds: "Three" | "Five" | "Seven", get: Atom.FnContext) {
			return yield* useAction(get, GameMatchAction.setMatchConfig({ numRounds }))
		}))
		const resetMatch = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
			return yield* useAction(get, GameMatchAction.resetMatch())
		}))
		const startCurrentGame = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
			const game = get(currentGame)
			if (GameState.$is("Crashed")(game)) {
				return false
			}
			return yield* useAction(
				get,
				GameMatchAction.startRound({
					config: {
						turnDurationMs: 30000,
						// todo: make optional and generate random turn order in state machine
						turnOrder: game.snapshot.players.map((player) => player.id)
						// boardSeed: crypto.randomUUID() //todo: make optional seed config
					}
				})
			)
		}))
		const submitSelectionPath = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
			const path = get(selectionPath)
			if (path.length === 0) return false
			return yield* pipe(
				get(currentGame),
				(game) =>
					GameState.$is("Crashed")(game)
						? Effect.die(new Error("Cannot submit word when game is crashed", { cause: game.cause }))
						: useAction(get, GameMatchAction.submitWord({ path, playerId: get(playerId) })),
				Effect.tapError(Effect.logError),
				Effect.catchTags({
					// todo: register errors with a toast atom backed system
					"EmptyWordSubmitted": () => Effect.succeed(false),
					"InvalidWordSubmitted": () => Effect.succeed(false)
				})
			)
		}))
		const autoSubmitOnValidPath = Atom.kvs({
			key: "autoSubmitOnValidPath",
			schema: Schema.Boolean,
			defaultValue: () => false,
			runtime: localStorageAtomRuntime
		})
		const autoSubmitEffect = Atom.make(Effect.fn(function*(get: Atom.AtomContext) {
			const enabled = get(autoSubmitOnValidPath)
			if (!enabled) return
			const currentPath = get(selectionPath)
			const valid = yield* isValidPath(currentPath)
			if (valid) {
				get.set(submitSelectionPath, void 0)
				yield* get.result(submitSelectionPath)
			}
		})).pipe(Atom.keepAlive) // keepAlive to persist component unmounts
		const isPlayerTurn = Atom.make((get) => {
			const game = get(currentGame)
			if (!isActiveTurnState(game)) return false
			return game.snapshot.currentRound.currentTurn.playerId === get(playerId)
		})
		return {
			atoms: {
				player: {
					name: playerName,
					id: playerId
				},
				autoSubmit: {
					value: autoSubmitOnValidPath,
					effect: autoSubmitEffect
				},
				selection: {
					path: selectionPath,
					tryUpdate: tryUpdateSelectionPath,
					clear: clearSelectionPath,
					word: currentWord,
					score: currentWordScore,
					isValid: isCurrentWordValid,
					submit: submitSelectionPath
				},
				isMouseDown,
				game: {
					state: currentGame,
					start: startCurrentGame,
					joinLobby: joinCurrentGameLobby,
					setConfig: setMatchConfig,
					reset: resetMatch
				},
				isPlayerTurn
			}
		}
	})
}) {
	static layerFresh = Layer.fresh(Layer.effect(this, this.make))
}
