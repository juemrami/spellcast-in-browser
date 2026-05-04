import { layerLocalStorage } from "@effect/platform-browser/BrowserKeyValueStore"
import { Effect, Layer, pipe, Random, Schema } from "effect"
import * as Context from "effect/Context"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Tile } from "../types/game"
import { CurrentBoard } from "./CurrentBoard"
import { GameMatchAction, GameState, GameStateMachine, isActiveTurnState } from "./GameStateMachine"

const toReadableAtom = <T>(atom: Atom.Writable<T>) => Atom.readable((get) => get(atom))

const areTilesAdjacent = (tileA: Tile, tileB: Tile): boolean => {
	const rowDiff = Math.abs(tileA.row - tileB.row)
	const colDiff = Math.abs(tileA.col - tileB.col)
	return rowDiff <= 1 && colDiff <= 1
}

const makeUUID = (): string => Effect.runSync(Random.nextUUIDv4)
const makeDefaultPlayerName = (): string => {
	return `Player-${Math.floor(Math.random() * 1000)}`
}

const localStorageAtomRuntime = Atom.runtime(layerLocalStorage)
/** Reactive browser runtime saved user variables */
export class SavedUserConfig extends Context.Service<SavedUserConfig>()(
	"app/UserConfig",
	{
		make: Effect.gen(function*() {
			const playerId = Atom.kvs({
				key: "user:playerId",
				schema: Schema.String,
				runtime: localStorageAtomRuntime,
				defaultValue: makeUUID
			})
			const playerSecret = Atom.kvs({
				key: "user:playerSecret",
				schema: Schema.String,
				runtime: localStorageAtomRuntime,
				defaultValue: makeUUID
			})
			const name = Atom.kvs({
				key: "user:name",
				schema: Schema.String,
				runtime: localStorageAtomRuntime,
				defaultValue: makeDefaultPlayerName
			})

			return {
				atoms: {
					identity: {
						uuid: playerId,
						secret: playerSecret,
						name: name
					}
				}
			}
		})
	}
) {}

type AtomArg<Fn> = Fn extends Atom.AtomResultFn<infer Args, infer _, infer _> ? Args : never
export class ClientPlayerState extends Context.Service<ClientPlayerState>()("app/PlayerClientState", {
	make: Effect.gen(function*() {
		const user = yield* SavedUserConfig
		const selectionPath = Atom.make([] as Array<Tile>)
		const { atoms: { state: gameState, reduce: reduceGame } } = yield* GameStateMachine
		const { scoring: { isValidPath, getPathScore } } = yield* CurrentBoard
		const useAction = Effect.fn(function*(get: Atom.FnContext, action: AtomArg<typeof reduceGame>) {
			get.set(reduceGame, action)
			return yield* get.result(reduceGame)
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

		const setMatchConfig = Atom.fn(Effect.fn(function*(numRounds: "Three" | "Five" | "Seven", get: Atom.FnContext) {
			return yield* useAction(get, GameMatchAction.setMatchConfig({ numRounds }))
		}))
		const resetMatch = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
			return yield* useAction(get, GameMatchAction.resetMatch())
		}))
		const startCurrentGame = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
			const game = get(gameState)
			if (!GameState.$is("Active")(game)) {
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
		const playerName = user.atoms.identity.name
		const playerUUID = user.atoms.identity.uuid
		const submitSelectionPath = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
			const path = get(selectionPath)
			if (path.length === 0) return false
			return yield* pipe(
				get(gameState),
				(game) =>
					GameState.$is("Crashed")(game)
						? Effect.die(new Error("Cannot submit word when game is crashed", { cause: game.cause }))
						: useAction(
							get,
							GameMatchAction.submitWord({ path, playerId: get(playerUUID) })
						),
				Effect.tapError(Effect.logError),
				Effect.catchTags({
					// todo: register errors with a toast atom backed system
					"EmptyWordSubmitted": () => Effect.succeed(false),
					"InvalidWordSubmitted": () => Effect.succeed(false)
				})
			)
		}))
		const autoSubmitConfig = Atom.kvs({
			key: "autoSubmitOnValidPath",
			schema: Schema.Boolean,
			defaultValue: () => false,
			runtime: localStorageAtomRuntime
		})
		const autoSubmitEffect = Atom.make(Effect.fn(function*(get: Atom.AtomContext) {
			const enabled = get(autoSubmitConfig)
			if (!enabled) return
			const currentPath = get(selectionPath)
			const valid = yield* isValidPath(currentPath)
			if (valid) {
				get.set(submitSelectionPath, void 0)
			}
		}))
		const isPlayerTurn = Atom.make((get) => {
			const game = get(gameState)
			if (!isActiveTurnState(game)) return false
			return game.snapshot.currentRound.currentTurn.playerId === get(playerUUID)
		})
		return {
			atoms: {
				playerName,
				playerUUID: toReadableAtom(user.atoms.identity.uuid),
				playerSecret: toReadableAtom(user.atoms.identity.secret),
				autoSubmit: Atom.writable(
					(get) => {
						get.mount(autoSubmitEffect)
						return get(autoSubmitConfig)
					},
					(ctx, value: boolean) => ctx.set(autoSubmitConfig, value)
				),
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
				lobby: {
					setConfig: setMatchConfig
				},
				game: {
					state: gameState,
					start: startCurrentGame,
					reset: resetMatch
				},
				isPlayerTurn
			}
		}
	})
}) {
	static layerFresh = Layer.fresh(Layer.effect(this, this.make))
}
