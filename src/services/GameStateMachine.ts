import { Context, Data, Duration, Effect, Match, pipe, type Predicate, Random, Ref, Stream, Struct } from "effect"
import type { TaggedEnum } from "effect/Data"
import type { HttpClientError } from "effect/unstable/http/HttpClientError"
import type { AtomRegistry } from "effect/unstable/reactivity"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Path } from "../types/game"
import * as BoardService from "./BoardService"

export const MIN_PLAYERS = 1

export const GameMatchPhase = {
	InLobby: "lobby",
	InRound: "in-round",
	BetweenRounds: "between-rounds"
} as const
export type GameMatchPhase = typeof GameMatchPhase[keyof typeof GameMatchPhase]

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
	readonly turnOrder: ReadonlyArray<string>
	readonly scores: ReadonlyArray<ScoreEntry>
	readonly turnDuration: Duration.Duration
}
export type GameMatchRound = Data.TaggedEnum<{
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
export const GameMatchRound = Data.taggedEnum<GameMatchRound>()

const GameStateSnapshotTypeId = "~GameStateMachine/GameStateSnapshot"
export interface GameStateSnapshot {
	[GameStateSnapshotTypeId]: typeof GameStateSnapshotTypeId
	readonly matchId: string
	readonly createdAt: number
	readonly phase: GameMatchPhase
	readonly players: ReadonlyArray<LobbyPlayer>
	readonly rounds: ReadonlyArray<GameMatchRound>
	readonly currentRound: GameMatchRound | null
	readonly scoreLedger: ReadonlyArray<ScoreEntry>
	readonly nextScoreEntryId: number
}
const makeStateSnapshot = (
	state: Omit<GameStateSnapshot, typeof GameStateSnapshotTypeId> | GameStateSnapshot
): GameStateSnapshot => ({
	[GameStateSnapshotTypeId]: GameStateSnapshotTypeId,
	...state
})

export type GameState = Data.TaggedEnum<{
	Active: {
		readonly snapshot: GameStateSnapshot
	}
	Crashed: {
		readonly cause: CurrentRoundNotFound
	}
}>
export const GameState = Data.taggedEnum<GameState>()

const omitTag = <T extends { _tag: string }>(obj: T): Omit<T, "_tag"> => Struct.omit(obj, ["_tag"])
const createInitialSnapshot = Effect.gen(function*() {
	return makeStateSnapshot({
		matchId: yield* Random.nextUUIDv4,
		createdAt: Date.now(),
		phase: GameMatchPhase.InLobby,
		currentRound: null,
		players: [],
		rounds: [],
		scoreLedger: [],
		nextScoreEntryId: 1
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

const addNewRoundToSnapshot = Effect.fn(function*(
	config: GameMatchRoundConfig
) {
	const state = yield* Ref.get(yield* StateSnapshotRef)
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
	const startedAt = Date.now()
	const endsAt = startedAt + config.turnDurationMs
	const newRound = GameMatchRound.InProgress({
		id: state.rounds.length + 1, // 1 indexed ids
		startedAt,
		turnOrder,
		turnDuration: Duration.millis(config.turnDurationMs),
		currentTurn: {
			playerId: turnOrder[0],
			turnIndex: 0,
			endsAtMs: endsAt
		},
		scores: []
	})

	yield* updateRounds(newRound, { allowNew: true })

	return yield* updateSnapshot({ currentRound: newRound })
})

const updateRounds = Effect.fn(function*<R extends GameMatchRound>(
	updatedRound: R,
	options: { allowNew?: boolean; skipRefUpdate?: boolean } = {}
) {
	const state = yield* Ref.get(yield* StateSnapshotRef)
	const isNew = !state.rounds.some((round) => round.id === updatedRound.id)
	if (!options.allowNew && isNew) {
		return yield* new RoundInactive({
			message: `Failed to find round with ID ${updatedRound.id} when updating round state`,
			state
		})
	}
	const rounds = isNew
		? [...state.rounds, updatedRound]
		: state.rounds.map((round) => (round.id === updatedRound.id ? updatedRound : round))

	if (!options.skipRefUpdate) {
		const isCurrentRound = !state.currentRound || state.currentRound.id === updatedRound.id
		yield* updateSnapshot({ rounds, ...(isCurrentRound ? { currentRound: updatedRound } : {}) })
	}
	return rounds
})

class LastMachineAction extends Context.Service<LastMachineAction, GameAction>()("LastMachineAction") {}
class StateSnapshotRef extends Context.Service<StateSnapshotRef, Ref.Ref<GameStateSnapshot>>()("StateSnapshot") {}

const getCurrentRound = Effect.gen(function*() {
	const snapshot = yield* Ref.get(yield* StateSnapshotRef)
	const action = yield* LastMachineAction
	const round = snapshot.currentRound
	if (!round) {
		return yield* new CurrentRoundNotFound({
			message: "Failed to find current round for game when performing action: " + action._tag,
			state: snapshot,
			action
		})
	}
	return round
})
const transitionToEndOfRound = Effect.gen(function*() {
	const snapshot = yield* Ref.get(yield* StateSnapshotRef)
	const currentRound = yield* getCurrentRound
	if (GameMatchRound.$is("Ended")(currentRound)) {
		return yield* new RoundInactive({
			message: "Cannot advance to end of round when current round is already ended",
			state: snapshot
		})
	}
	if (!GameMatchRound.$is("BetweenTurns")(currentRound)) {
		return yield* new InvalidStateTransition({
			message: "Cannot advance to end of round when current round is not between turns",
			action: yield* LastMachineAction,
			state: snapshot
		})
	}
	return yield* updateSnapshot({
		phase: GameMatchPhase.BetweenRounds,
		rounds: yield* updateRounds(
			GameMatchRound.Ended({
				...omitTag(currentRound),
				endedAt: Date.now()
			})
		)
	})
})

const transitionToNextPlayerTurn = Effect.gen(function*() {
	const snapshot = yield* Ref.get(yield* StateSnapshotRef)
	const currentRound = yield* getCurrentRound
	if (GameMatchRound.$is("Ended")(currentRound)) {
		return yield* new RoundInactive({
			message: "Cannot advance player turn when current round has already ended",
			state: snapshot
		})
	}
	if (!GameMatchRound.$is("BetweenTurns")(currentRound)) {
		return yield* new InvalidStateTransition({
			message: "Cannot advance player turn when current round is not between turns: " + currentRound._tag,
			action: yield* LastMachineAction,
			state: snapshot
		})
	}
	const nextPlayerIdx = currentRound.lastTurn.turnIndex + 1
	if (nextPlayerIdx >= currentRound.turnOrder.length) {
		return yield* transitionToEndOfRound
	}
	const nextPlayerId = currentRound.turnOrder[nextPlayerIdx]
	yield* updateRounds(GameMatchRound.InProgress({
		...omitTag(currentRound),
		currentTurn: {
			playerId: nextPlayerId,
			turnIndex: nextPlayerIdx,
			endsAtMs: Date.now() + Duration.toMillis(currentRound.turnDuration)
		}
	}))
})

const updateSnapshot = (diff: Partial<GameStateSnapshot>) =>
	Effect.gen(function*() {
		const snapshot = yield* StateSnapshotRef
		const current = yield* Ref.get(snapshot)
		const next = { ...current, ...diff }
		yield* Ref.set(snapshot, next)
		return next
	})
// ** Note: Assumes the path's word has been validated for correctness */
const scoreAndClosePlayerTurn = Effect.fn(function*(
	playerId: string,
	currentRound: TaggedEnum.Value<GameMatchRound, "InProgress">,
	path: Path
) {
	const stateRef = yield* StateSnapshotRef
	let state = yield* Ref.get(stateRef)
	const board = yield* BoardService.BoardService
	if (currentRound.id !== state.currentRound?.id) {
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
		id: `claim-${state.nextScoreEntryId}`,
		playerId,
		roundId: currentRound.id,
		points,
		word,
		path,
		submittedAtMs: Date.now()
	}

	state = yield* Ref.get(stateRef) // latest state after round update
	yield* updateRounds(
		GameMatchRound.BetweenTurns({
			...omitTag(currentRound),
			scores: [...currentRound.scores, scoreEntry],
			lastTurn: {
				playerId,
				turnIndex: playerIndex,
				score: scoreEntry
			}
		})
	)
	// update player cumulative score and ledger
	return yield* updateSnapshot({
		players: state.players.map((player) =>
			player.id === playerId
				? { ...player, score: player.score + scoreEntry.points }
				: player
		),
		scoreLedger: [...state.scoreLedger, scoreEntry],
		nextScoreEntryId: state.nextScoreEntryId + 1
	}).pipe(
		Effect.andThen(Effect.log("Claiming score for current round", scoreEntry))
	)
})

export class CurrentRoundNotFound extends Data.TaggedError("CurrentRoundNotFound")<{
	readonly message: string
	readonly state: GameStateSnapshot
	readonly action?: GameAction
}> {}
export class RoundInactive extends Data.TaggedError("RoundInactive")<{
	readonly message: string
	readonly state: GameStateSnapshot
}> {}
export class NotEnoughPlayers extends Data.TaggedError("NotEnoughPlayers")<{
	readonly message: string
}> {}
export class InvalidStateTransition extends Data.TaggedError("InvalidStateTransition")<{
	readonly message: string
	readonly action: GameAction
	readonly state: GameStateSnapshot
}> {}

export class EmptyWordSubmitted extends Data.TaggedError("EmptyWordSubmitted")<{
	readonly message: string
}> {}
export class InvalidWordSubmitted extends Data.TaggedError("InvalidWordSubmitted")<{
	readonly message: string
}> {}
export class InvalidActor extends Data.TaggedError("InvalidActor")<{
	readonly message: string
	action: GameAction
}> {}

export type GameAction = Data.TaggedEnum<{
	joinLobby: {
		player: {
			readonly id: string
			readonly name: string
		}
		ready?: boolean
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
export const GameAction = Data.taggedEnum<GameAction>()
export const reduceGameState = (
	state: GameStateSnapshot,
	action: GameAction
) =>
	Effect.gen(function*() {
		const snapshotRef = yield* Ref.make(state)
		yield* Match.value(action).pipe(
			Match.tagsExhaustive({
				joinLobby: ({ player, ready }) =>
					Effect.gen(function*() {
						if (state.phase !== GameMatchPhase.InLobby) {
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
				leaveLobby: ({ playerId }) =>
					Effect.gen(function*() {
						if (state.phase !== GameMatchPhase.InLobby) {
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
						if (state.phase !== GameMatchPhase.InLobby) {
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
						const isNewGame = state.phase === GameMatchPhase.InLobby
						if (state.phase !== GameMatchPhase.BetweenRounds && !isNewGame) {
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
						yield* addNewRoundToSnapshot(config)
						return yield* updateSnapshot(
							isNewGame ?
								{
									matchId: yield* Random.nextUUIDv4,
									createdAt: Date.now(),
									phase: GameMatchPhase.InRound
								} :
								{ phase: GameMatchPhase.InRound }
						)
					}),
				submitWord: (submitAction) =>
					Effect.gen(function*() {
						if (state.phase !== GameMatchPhase.InRound) {
							return yield* new InvalidStateTransition({
								message: "Cannot submit word when game is not in a round phase",
								action: submitAction,
								state
							})
						}
						const currentRound = state.currentRound
						if (!GameMatchRound.$is("InProgress")(currentRound)) {
							return yield* new RoundInactive({
								message: "Cannot submit word when round is not active",
								state
							})
						}
						const board = yield* BoardService.BoardService
						const submittedWord = submitAction.path.map((node) => node.letter).join("")
						if (submittedWord.trim().length === 0) {
							return yield* new EmptyWordSubmitted({
								message: "Cannot submit empty word"
							})
						}
						const boardSolutions = yield* Atom.getResult(board.boardSolutions)
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
						if (state.phase !== GameMatchPhase.InRound) {
							return yield* new InvalidStateTransition({
								message: "Cannot advance turn when game is not in a round phase",
								action: turnAction,
								state
							})
						}
						const currentRound = yield* getCurrentRound
						if (!GameMatchRound.$is("InProgress")(currentRound)) {
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
						if (state.phase !== GameMatchPhase.InRound) {
							return yield* new InvalidStateTransition({
								message: "Cannot end round when game is not in a round",
								action: endAction,
								state
							})
						}
						if (GameMatchRound.$is("BetweenTurns")(state.currentRound)) {
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
			Effect.provideService(StateSnapshotRef, snapshotRef),
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
			Exclude<FnRequirements<typeof reduceGameState>, AtomRegistry.AtomRegistry>,
			HttpClientError
		>
	) {
		const initialValue = yield* createInitialSnapshot
		// todo: gameState should maybe not be initialized till the runtime is done (so that we have wordlist)
		const gameState = Atom.make<GameState>(GameState.Active({ snapshot: initialValue }))
		const reduceFn = runtime.fn(Effect.fn(function*(action: GameAction, get: Atom.FnContext) {
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
				Effect.catchTags({
					"CurrentRoundNotFound": (cause) => Effect.succeed(GameState.Crashed({ cause }))
				})
			)
			get.set(gameState, next)
			return true
		}))
		type ActiveTurnGameState = GameState & {
			_tag: "Active"
			snapshot: {
				phase: typeof GameMatchPhase.InRound
				currentRound: {
					_tag: "InProgress"
				}
			}
		}
		type IsActiveTurnStateRefinement = Predicate.Refinement<GameState, ActiveTurnGameState>
		const isActiveTurnState: IsActiveTurnStateRefinement = (
			state
		): state is ActiveTurnGameState =>
			Boolean(
				GameState.$is("Active")(state) && state.snapshot.phase === GameMatchPhase.InRound &&
					state.snapshot.currentRound && GameMatchRound.$is("InProgress")(state.snapshot.currentRound)
			)
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
									GameAction.advanceTurn({ reason: AdvanceTurnReason.Timer, playerId: currentTurn.playerId })
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
			atom: Atom.writable((get) => get(gameState), (ctx, action: GameAction) => ctx.set(reduceFn, action)),
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

export const isGameInRound: Predicate.Refinement<
	unknown,
	GameStateSnapshot & { phase: typeof GameMatchPhase.InRound }
> = (
	state
): state is GameStateSnapshot & { phase: typeof GameMatchPhase.InRound } =>
	typeof state === "object"
	&& state !== null
	&& GameStateSnapshotTypeId in state
	&& (state as GameStateSnapshot).phase === GameMatchPhase.InRound
