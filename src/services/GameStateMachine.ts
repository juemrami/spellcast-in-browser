import {
	Context,
	Data,
	Duration,
	Effect,
	Match,
	pipe,
	type Predicate,
	Random,
	Ref,
	Schema,
	SchemaGetter,
	Stream,
	Struct
} from "effect"
import type { TaggedEnum } from "effect/Data"
import type { HttpClientError } from "effect/unstable/http/HttpClientError"
import type { KeyValueStore } from "effect/unstable/persistence"
import { AtomRegistry } from "effect/unstable/reactivity"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Path } from "../types/game"
import * as BoardService from "./CurrentBoard"

export const MIN_PLAYERS = 1

export const RoundStatus = {
	Active: "active",
	Ended: "ended"
} as const
export type RoundStatus = typeof RoundStatus[keyof typeof RoundStatus]

export const RoundEndReason = {
	Timer: "timer",
	Manual: "manual",
	BoardExhausted: "board-exhausted"
} as const
export type RoundEndReason = typeof RoundEndReason[keyof typeof RoundEndReason]

export const AdvanceTurnReason = {
	WordSubmitted: "word-submitted",
	Timer: "timer",
	Manual: "manual"
} as const
export type AdvanceTurnReason = typeof AdvanceTurnReason[keyof typeof AdvanceTurnReason]

export interface LobbyPlayer {
	readonly id: string
	readonly name: string
	readonly ready: boolean
	readonly score: number
	readonly joinedAt: number | null
}

export interface GameMatchRoundConfig {
	readonly turnDurationMs: number
	readonly turnOrder: ReadonlyArray<string>
	// readonly boardSeed?: string | null // todo allow preseeding board for testing purposes
}

export interface ScoreEntry {
	readonly id: string
	readonly playerId: string
	readonly roundId: number
	readonly points: number
	readonly word: string
	readonly path: Path
	readonly submittedAtMs: number
}
type BaseRound = {
	readonly id: number
	readonly startedAt: number
	readonly seed: number
	readonly turnOrder: ReadonlyArray<string>
	readonly scores: ReadonlyArray<ScoreEntry>
	readonly turnDuration: Duration.Duration
}
export type MatchRoundState = Data.TaggedEnum<{
	InProgress: BaseRound & {
		readonly currentTurn: {
			readonly playerId: string
			readonly turnIndex: number
			readonly endsAtMs: number
		}
	}
	BetweenTurns: BaseRound & {
		readonly lastTurn: {
			readonly playerId: string
			readonly turnIndex: number
			readonly score: ScoreEntry
		}
	}
	Ended: BaseRound & {
		readonly endedAt: number
		readonly lastTurn: {
			readonly playerId: string
			readonly turnIndex: number
			readonly score: ScoreEntry
		}
	}
}>
export const MatchRoundState = Data.taggedEnum<MatchRoundState>()

type BaseMatch = {
	readonly matchId: string
	readonly createdAt: number
	readonly players: ReadonlyArray<LobbyPlayer>
	readonly config: {
		readonly numRounds: 3 | 5 | 7
	}
}
export type GameMatchState = Data.TaggedEnum<{
	InLobby: BaseMatch
	InRound: BaseMatch & {
		readonly currentRound: Data.TaggedEnum.Value<MatchRoundState, "InProgress" | "BetweenTurns">
		readonly rounds: ReadonlyArray<Data.TaggedEnum.Value<MatchRoundState, "Ended">>
		readonly scoreLedger: ReadonlyArray<ScoreEntry>
	}
	BetweenRounds: BaseMatch & {
		readonly rounds: ReadonlyArray<Data.TaggedEnum.Value<MatchRoundState, "Ended">>
		readonly lastRound: Data.TaggedEnum.Value<MatchRoundState, "Ended">
		readonly scoreLedger: ReadonlyArray<ScoreEntry>
	}
	MatchRecap: BaseMatch & {
		readonly endedAt: number
		readonly lastRound: Data.TaggedEnum.Value<MatchRoundState, "Ended">
		readonly rounds: ReadonlyArray<Data.TaggedEnum.Value<MatchRoundState, "Ended">>
		readonly scoreLedger: ReadonlyArray<ScoreEntry>
	}
}>
export const GameMatchState = Object.assign(Data.taggedEnum<GameMatchState>(), {
	$isOr:
		<T extends GameMatchState["_tag"]>(...tags: Array<T>) =>
		(state: GameMatchState): state is Extract<GameMatchState, { _tag: T }> => tags.includes(state._tag as T)
})

export type GameState = Data.TaggedEnum<{
	Active: {
		readonly snapshot: GameMatchState
	}
	Crashed: {
		readonly cause: CurrentRoundNotFound
	}
}>
export const GameState = Data.taggedEnum<GameState>()

const omitTag = <T extends { _tag: string }>(obj: T): Omit<T, "_tag"> => Struct.omit(obj, ["_tag"])
const createInitialSnapshot = Effect.gen(function*() {
	return GameMatchState.InLobby({
		matchId: yield* Random.nextUUIDv4,
		createdAt: Date.now(),
		players: [],
		config: {
			numRounds: 3
		}
	})
})

const upsertPlayer = (
	players: ReadonlyArray<LobbyPlayer>,
	player: LobbyPlayer
): Array<LobbyPlayer> => {
	const isNew = !players.some((currentPlayer) => currentPlayer.id === player.id)
	if (isNew) {
		return [...players, player]
	}
	return players.map((existing) =>
		existing.id === player.id
			? player
			: existing
	)
}

const addNewRoundAndTransition = Effect.fn(function*(
	state: Data.TaggedEnum.Value<GameMatchState, "InLobby" | "BetweenRounds">,
	config: GameMatchRoundConfig
) {
	if (state.players.length < MIN_PLAYERS) {
		yield* new NotEnoughPlayers({ message: `At least ${MIN_PLAYERS} players in game are required to start a round` })
	}
	if (config.turnOrder.length < MIN_PLAYERS) {
		yield* new NotEnoughPlayers({
			message: `At least ${MIN_PLAYERS} players in turn order are required to start a round`
		})
	}
	// filter out invalid player IDs and duplicates while preserving the original order.
	const allowedPlayerIds = new Set(state.players.map((player) => player.id))
	const seen = new Set<string>()
	const turnOrder: Array<string> = []
	for (const playerId of config.turnOrder) {
		if (!allowedPlayerIds.has(playerId) || seen.has(playerId)) {
			continue
		}
		seen.add(playerId)
		turnOrder.push(playerId)
	}
	if (turnOrder.length !== config.turnOrder.length) {
		yield* new NotEnoughPlayers({
			message: `Number of players in turn order does not match the number of valid players`
		})
	}
	const id = !GameMatchState.$is("InLobby")(state) ? state.rounds.length + 1 : 1
	const startedAt = Date.now()
	const endsAt = startedAt + config.turnDurationMs
	const roundSeed = yield* Random.nextInt
	const newRound = MatchRoundState.InProgress({
		id,
		startedAt,
		turnOrder,
		turnDuration: Duration.millis(config.turnDurationMs),
		currentTurn: {
			playerId: turnOrder[0],
			turnIndex: 0,
			endsAtMs: endsAt
		},
		scores: [],
		seed: roundSeed
	})
	const isNewGame = GameMatchState.$is("InLobby")(state)
	yield* Ref.set(
		yield* TransitionMatchStateRef,
		GameMatchState.InRound({
			...omitTag(state),
			currentRound: newRound,
			rounds: isNewGame ? [] : state.rounds,
			scoreLedger: isNewGame ? [] : state.scoreLedger
		})
	)
})

class LastMachineAction extends Context.Service<LastMachineAction, GameMatchAction>()("LastMachineAction") {}
class TransitionMatchStateRef
	extends Context.Service<TransitionMatchStateRef, Ref.Ref<GameMatchState>>()("StateSnapshot")
{}

const transitionToEndOfRound = Effect.gen(function*() {
	const matchRef = yield* TransitionMatchStateRef
	const match = yield* Ref.get(matchRef)
	if (!GameMatchState.$is("InRound")(match)) {
		return yield* new InvalidStateTransition({
			message: "Cannot advance to end of round when game is not in a round phase",
			action: yield* LastMachineAction,
			state: match
		})
	}
	if (MatchRoundState.$is("Ended")(match.currentRound)) {
		return yield* new RoundInactive({
			message: "Cannot advance to end of round when current round is already ended",
			state: match
		})
	}
	if (!MatchRoundState.$is("BetweenTurns")(match.currentRound)) {
		return yield* new InvalidStateTransition({
			message: "Cannot advance to end of round when current round is not between turns",
			action: yield* LastMachineAction,
			state: match
		})
	}
	const endedAt = Date.now()
	const lastRound = MatchRoundState.Ended({
		...omitTag(match.currentRound),
		endedAt
	})
	const roundMeta = {
		lastRound,
		rounds: [...match.rounds, lastRound]
	}
	const nextMatchState = (lastRound.id >= match.config.numRounds)
		? GameMatchState.MatchRecap({
			...omitTag(match),
			...roundMeta,
			endedAt
		})
		: GameMatchState.BetweenRounds({
			...omitTag(match),
			...roundMeta
		})

	yield* Ref.set(matchRef, nextMatchState)
	return nextMatchState
})

const transitionToNextPlayerTurn = Effect.gen(function*() {
	const matchRef = yield* TransitionMatchStateRef
	const match = yield* Ref.get(matchRef)
	if (!GameMatchState.$is("InRound")(match)) {
		return yield* new InvalidStateTransition({
			message: "Cannot advance player turn when game is not in a round phase",
			action: yield* LastMachineAction,
			state: match
		})
	}
	if (MatchRoundState.$is("Ended")(match.currentRound)) {
		return yield* new RoundInactive({
			message: "Cannot advance player turn when current round has already ended",
			state: match
		})
	}
	if (!MatchRoundState.$is("BetweenTurns")(match.currentRound)) {
		return yield* new InvalidStateTransition({
			message: "Cannot advance player turn when current round is not between turns: " + match.currentRound._tag,
			action: yield* LastMachineAction,
			state: match
		})
	}
	const nextPlayerIdx = match.currentRound.lastTurn.turnIndex + 1
	if (nextPlayerIdx >= match.currentRound.turnOrder.length) {
		return yield* transitionToEndOfRound
	}
	const nextPlayerId = match.currentRound.turnOrder[nextPlayerIdx]
	const nextRound = MatchRoundState.InProgress({
		...omitTag(match.currentRound),
		currentTurn: {
			playerId: nextPlayerId,
			turnIndex: nextPlayerIdx,
			endsAtMs: Date.now() + Duration.toMillis(match.currentRound.turnDuration)
		}
	})
	yield* Ref.set(
		matchRef,
		GameMatchState.InRound({
			...omitTag(match),
			currentRound: nextRound
		})
	)
})

const updateSnapshot = (diff: Partial<TaggedEnum.Value<GameMatchState, "InLobby" | "InRound" | "BetweenRounds">>) =>
	Effect.gen(function*() {
		const snapshot = yield* TransitionMatchStateRef
		const current = yield* Ref.get(snapshot)
		const next = (diff._tag ? { ...omitTag(current), ...diff } : { ...current, ...diff }) as GameMatchState
		yield* Ref.set(snapshot, next)
		return next
	})
// ** Note: Assumes the path's word has been validated for correctness */
const scoreAndClosePlayerTurn = Effect.fn(function*(
	playerId: string,
	currentRound: TaggedEnum.Value<MatchRoundState, "InProgress">,
	path: Path
) {
	const stateRef = yield* TransitionMatchStateRef
	const state = yield* Ref.get(stateRef)
	const board = yield* BoardService.CurrentBoard
	if (!GameMatchState.$is("InRound")(state) || currentRound.id !== state.currentRound?.id) {
		return yield* Effect.die(
			"scoreAndClosePlayerTurn currentRound's id does not match the current round ID in game state"
		)
	}
	const playerIndex = state.players.findIndex((player) => player.id === playerId)
	if (playerIndex === -1) {
		return yield* new InvalidActor({
			message: `Failed to find player with ID ${playerId} when setting round score for player`,
			action: yield* LastMachineAction
		})
	}
	const word = path.map((node) => node.letter).join("")
	const points = path.reduce((score, pathNode) => score + board.getTileScore(pathNode), 0)
	const scoreEntry: ScoreEntry = {
		id: `${currentRound.id}-${playerId}`,
		playerId,
		roundId: currentRound.id,
		points,
		word,
		path,
		submittedAtMs: Date.now()
	}
	const nextRoundState = MatchRoundState.BetweenTurns({
		...omitTag(currentRound),
		scores: [...currentRound.scores, scoreEntry],
		lastTurn: {
			playerId,
			turnIndex: playerIndex,
			score: scoreEntry
		}
	})
	yield* Ref.set(
		stateRef,
		GameMatchState.InRound({
			...omitTag(state),
			currentRound: nextRoundState,
			players: state.players.map((player) =>
				player.id === playerId
					? { ...player, score: player.score + scoreEntry.points }
					: player
			),
			scoreLedger: [...state.scoreLedger, scoreEntry]
		})
	).pipe(
		Effect.andThen(Effect.log("Claiming score for current round", scoreEntry))
	)
})

export class CurrentRoundNotFound extends Data.TaggedError("CurrentRoundNotFound")<{
	readonly message: string
	readonly state: GameMatchState
	readonly action?: GameMatchAction
}> {}
export class RoundInactive extends Data.TaggedError("RoundInactive")<{
	readonly message: string
	readonly state: GameMatchState
}> {}
export class NotEnoughPlayers extends Data.TaggedError("NotEnoughPlayers")<{
	readonly message: string
}> {}
export class InvalidStateTransition extends Data.TaggedError("InvalidStateTransition")<{
	readonly message: string
	readonly action: GameMatchAction
	readonly state: GameMatchState
}> {}

export class EmptyWordSubmitted extends Data.TaggedError("EmptyWordSubmitted")<{
	readonly message: string
}> {}
export class InvalidWordSubmitted extends Data.TaggedError("InvalidWordSubmitted")<{
	readonly message: string
}> {}
export class InvalidActor extends Data.TaggedError("InvalidActor")<{
	readonly message: string
	action: GameMatchAction
}> {}

export type GameMatchAction = Data.TaggedEnum<{
	joinLobby: {
		player: {
			readonly id: string
			readonly name: string
		}
		ready?: boolean
	}
	setMatchConfig: {
		numRounds: "Three" | "Five" | "Seven"
	}
	leaveLobby: {
		playerId: string
	}
	setReady: {
		playerId: string
		ready: boolean
	}
	startRound: {
		config: GameMatchRoundConfig
	}
	submitWord: {
		playerId: string
		path: Path
	}
	advanceTurn: {
		reason: AdvanceTurnReason
		playerId: string
	}
	endRound: {
		roundId: number
		reason: RoundEndReason
		endedAt: number
	}
	resetMatch: {}
}>
export const GameMatchAction = Data.taggedEnum<GameMatchAction>()
export const reduceGameState = (
	state: GameMatchState,
	action: GameMatchAction
) =>
	Effect.gen(function*() {
		const snapshotRef = yield* Ref.make(state)
		yield* Match.value(action).pipe(
			Match.tagsExhaustive({
				joinLobby: ({ player, ready }) =>
					Effect.gen(function*() {
						if (!GameMatchState.$is("InLobby")(state)) {
							return yield* new InvalidStateTransition({
								message: "Cannot join lobby when game is not in lobby phase",
								action,
								state
							})
						}
						const joinedAt = state.players.find((p) => player.id === p.id)?.joinedAt ?? Date.now()
						return yield* updateSnapshot({
							players: upsertPlayer(state.players, {
								id: player.id,
								name: player.name,
								ready: ready ?? false,
								score: 0,
								joinedAt
							})
						})
					}),
				setMatchConfig: ({ numRounds }) =>
					Effect.gen(function*() {
						if (!GameMatchState.$is("InLobby")(state)) {
							return yield* new InvalidStateTransition({
								message: "Cannot set match config when game is not in lobby phase",
								action,
								state
							})
						}
						const rounds = numRounds === "Three" ? 3 : numRounds === "Five" ? 5 : 7
						yield* Ref.set(
							yield* TransitionMatchStateRef,
							GameMatchState.InLobby({
								...omitTag(state),
								config: {
									numRounds: rounds
								}
							})
						)
					}),
				leaveLobby: ({ playerId }) =>
					Effect.gen(function*() {
						if (!GameMatchState.$is("InLobby")(state)) {
							return yield* new InvalidStateTransition({
								message: "Cannot leave lobby when game is not in lobby phase",
								action,
								state
							})
						}
						return yield* updateSnapshot({
							players: state.players.filter((player) => player.id !== playerId)
						})
					}),
				setReady: ({ playerId, ready }) =>
					Effect.gen(function*() {
						if (!GameMatchState.$is("InLobby")(state)) {
							return yield* new InvalidStateTransition({
								message: "Cannot change ready status when game is not in lobby phase",
								action,
								state
							})
						}
						return yield* updateSnapshot({
							players: state.players.map((player) =>
								player.id === playerId
									? { ...player, ready }
									: player
							)
						})
					}),
				startRound: ({ config }) =>
					Effect.gen(function*() {
						const isNewGame = GameMatchState.$is("InLobby")(state)
						if (!GameMatchState.$is("BetweenRounds")(state) && !isNewGame) {
							return yield* new InvalidStateTransition({
								message: "Cannot start round when game is not between rounds or in lobby",
								action,
								state
							})
						}
						if (state.players.length < MIN_PLAYERS) {
							return yield* new NotEnoughPlayers({
								message: `At least ${MIN_PLAYERS} players are required to start the round`
							})
						}
						yield* addNewRoundAndTransition(state, config)
					}),
				submitWord: (submitAction) =>
					Effect.gen(function*() {
						if (!GameMatchState.$is("InRound")(state)) {
							return yield* new InvalidStateTransition({
								message: "Cannot submit word when game is not in a round phase",
								action: submitAction,
								state
							})
						}
						const currentRound = state.currentRound
						if (!MatchRoundState.$is("InProgress")(currentRound)) {
							return yield* new RoundInactive({
								message: "Cannot submit word when round is not active",
								state
							})
						}
						const board = yield* BoardService.CurrentBoard
						const submittedWord = submitAction.path.map((node) => node.letter).join("")
						if (submittedWord.trim().length === 0) {
							return yield* new EmptyWordSubmitted({
								message: "Cannot submit empty word"
							})
						}
						const boardSolutions = yield* board.boardSolutions
						if (!boardSolutions.words.has(submittedWord)) {
							return yield* new InvalidWordSubmitted({
								message: `"${submittedWord}" is not a valid word for the current board`
							})
						}
						if (state.players.find((player) => player.id === submitAction.playerId) === undefined) {
							return yield* new InvalidActor({
								message: "Player submitting word is not part of the game",
								action: submitAction
							})
						}
						if (
							state.scoreLedger.some((entry) =>
								entry.roundId === currentRound.id
								&& entry.playerId === submitAction.playerId
							)
						) {
							return yield* new InvalidActor({
								message: "Player has already submitted a word for this round",
								action: submitAction
							})
						}
						yield* scoreAndClosePlayerTurn(submitAction.playerId, currentRound, submitAction.path)
						return yield* transitionToNextPlayerTurn
					}),
				advanceTurn: (turnAction) =>
					Effect.gen(function*() {
						if (!GameMatchState.$is("InRound")(state)) {
							return yield* new InvalidStateTransition({
								message: "Cannot advance turn when game is not in a round phase",
								action: turnAction,
								state
							})
						}
						const currentRound = state.currentRound
						if (!MatchRoundState.$is("InProgress")(currentRound)) {
							return yield* new RoundInactive({
								message: "Cannot advance turn when turn is not in progress",
								state
							})
						}
						// maybe stale timer fired for a turn that already passed?
						if (currentRound.currentTurn.playerId !== turnAction.playerId) {
							return yield* new InvalidActor({
								message: "Cannot advance turn for player who is not currently taking their turn",
								action: turnAction
							})
						}
						const hasCurrentPlayerScored = state.scoreLedger.some((entry) =>
							entry.roundId === currentRound.id && entry.playerId === currentRound.currentTurn.playerId
						)
						if (!hasCurrentPlayerScored && turnAction.reason === AdvanceTurnReason.Timer) {
							// auto-submit empty word for current player since their turn timer expired without a submission
							const now = Date.now()
							if (currentRound.currentTurn.endsAtMs > now) {
								return yield* new InvalidStateTransition({
									message:
										"Cannot advance turn due to timer when current turn timer has not yet expired, use `manual` reason to force advance turn",
									action: turnAction,
									state
								})
							}
							yield* Effect.log(
								`Round timer ended for round ${currentRound.id}, transitioning to next turn/round`
							)
							yield* scoreAndClosePlayerTurn(
								turnAction.playerId,
								currentRound,
								[] // empty path for timer submissions since there is no word
							)
						}
						if (turnAction.reason === AdvanceTurnReason.Manual && !hasCurrentPlayerScored) {
							// handle manual advance turn when current player has not scored
							// todo: this seems dumb to expose
							return yield* Effect.die("advanceTurn with reason \"manual\" is not allowed yet")
						}
						return yield* transitionToNextPlayerTurn
					}),
				endRound: (endAction) =>
					Effect.gen(function*() {
						if (!GameMatchState.$is("InRound")(state)) {
							return yield* new InvalidStateTransition({
								message: "Cannot end round when game is not in a round",
								action: endAction,
								state
							})
						}
						if (MatchRoundState.$is("BetweenTurns")(state.currentRound)) {
							if (state.currentRound.lastTurn.turnIndex < state.currentRound.turnOrder.length - 1) {
								return yield* new InvalidStateTransition({
									message: "Cannot end round while there are still players who have not taken their turn",
									action: endAction,
									state
								})
							}
						}
						yield* transitionToEndOfRound
					}),
				resetMatch: () =>
					Effect.gen(function*() {
						const initial = yield* createInitialSnapshot
						return yield* updateSnapshot({
							...initial,
							matchId: state.matchId // preserve match ID on reset
						})
					})
			}),
			Effect.provideService(TransitionMatchStateRef, snapshotRef),
			Effect.provideService(LastMachineAction, action)
		)
		const nextState = yield* Ref.get(snapshotRef)
		yield* Effect.log(`Game State transitioned due to ${action._tag}`, { prev: state, next: nextState })
		return nextState
	})
type FnRequirements<Fn extends (...args: Array<any>) => Effect.Effect<any, any, any>> = Effect.Services<ReturnType<Fn>>
export const make = Effect.fn(
	function*(
		runtime: Atom.AtomRuntime<
			Exclude<FnRequirements<typeof reduceGameState>, AtomRegistry.AtomRegistry> | KeyValueStore.KeyValueStore,
			HttpClientError
		>
	) {
		const initialValue = yield* createInitialSnapshot
		// todo: gameState should maybe not be initialized till the runtime is done (so that we have wordlist)
		const gameState = Atom.kvs({
			runtime,
			schema: pipe(
				Schema.String,
				Schema.decodeTo(
					Schema.declare<GameState>((u: unknown): u is GameState =>
						typeof u === "object" && u !== null && GameState.$is("Active")(u) || GameState.$is("Crashed")(u)
					),
					{
						decode: SchemaGetter.transform((str) => JSON.parse(str) as GameState),
						encode: SchemaGetter.transform((state) => JSON.stringify(state))
					}
				)
			),
			key: `hostedGameState`,
			defaultValue: () => GameState.Active({ snapshot: initialValue })
		})

		const registry = yield* AtomRegistry.AtomRegistry
		// side effect: ensures update to date board based on the round seed.
		// todo: this should be done imperatively on new round creation.
		registry.mount(runtime.atom(Effect.fn(function*(get: Atom.AtomContext) {
			const boardService = yield* BoardService.CurrentBoard
			const state = get(gameState)
			if (GameState.$is("Active")(state) && GameMatchState.$is("InRound")(state.snapshot)) {
				const seed = state.snapshot.currentRound.seed
				yield* boardService.regenerateBoard(seed)
			}
		})))
		const reduceFn = runtime.fn(Effect.fn(function*(action: GameMatchAction, get: Atom.FnContext) {
			const current = get(gameState)
			if (GameState.$is("Crashed")(current)) {
				return false
			}
			const next = yield* pipe(
				reduceGameState(current.snapshot, action),
				Effect.map((nextSnapshot) => {
					return current.snapshot !== nextSnapshot
						? GameState.Active({ snapshot: nextSnapshot })
						: current
				}),
				Effect.tapError((e) =>
					Effect.logWarning(`Error processing game state transition for action ${action._tag}`, e)
				),
				Effect.catchTags({
					// handle crash state errors by transitioning to Crashed state with error info
					// "InvalidStateTransition": (e) => GameState.Crashed({ cause: e }),
					// uncaught errors will bubble up to AsyncResult of the reduceFn atom
				})
			)
			get.set(gameState, next)
			return true
		}))

		yield* pipe(
			Atom.toStream(gameState),
			Stream.changesWith((a, b) => {
				if (!isActiveTurnState(a) || !isActiveTurnState(b)) return !isActiveTurnState(a) && !isActiveTurnState(b)
				return a.snapshot.currentRound.currentTurn.endsAtMs === b.snapshot.currentRound.currentTurn.endsAtMs
			}),
			// auto-cancels previous timer via switchMap
			Stream.switchMap((state) =>
				Match.value(state).pipe(
					Match.when(isActiveTurnState, ({ snapshot: { currentRound: { id, currentTurn } } }) =>
						Stream.fromEffect(Effect.gen(function*() {
							yield* Effect.log(
								`Starting round ${id} timer for player ${currentTurn.playerId}. Turn ends at ${
									new Date(currentTurn.endsAtMs).toLocaleTimeString()
								}`
							)
							return yield* Effect.delay(
								Atom.set(
									reduceFn,
									GameMatchAction.advanceTurn({ reason: AdvanceTurnReason.Timer, playerId: currentTurn.playerId })
								),
								Duration.millis(currentTurn.endsAtMs - Date.now())
							)
						}))),
					Match.orElse(() =>
						Stream.empty
					)
				)
			),
			Stream.runDrain,
			Effect.forkScoped
		)
		return {
			atom: Atom.writable((get) => get(gameState), (ctx, action: GameMatchAction) => ctx.set(reduceFn, action)),
			dispatch: reduceFn
		}
	}
)

/** Atom wrapped state machine for a single game/match */
export class GameStateMachine extends Context.Service<
	GameStateMachine,
	Effect.Success<ReturnType<typeof make>>
>()(
	"host/GameStateMachine"
) {}

type ActiveTurnGameState = Data.TaggedEnum.Value<GameState, "Active"> & {
	snapshot: Data.TaggedEnum.Value<GameMatchState, "InRound"> & {
		currentRound: Data.TaggedEnum.Value<MatchRoundState, "InProgress">
	}
}
export const isActiveTurnState: Predicate.Refinement<GameState, ActiveTurnGameState> = (
	state
): state is ActiveTurnGameState =>
	GameState.$is("Active")(state)
	&& GameMatchState.$is("InRound")(state.snapshot)
	&& MatchRoundState.$is("InProgress")(state.snapshot.currentRound)
