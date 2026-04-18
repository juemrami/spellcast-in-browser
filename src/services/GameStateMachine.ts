import { Context, Data, Effect, Match, pipe, Predicate, Random, Ref } from "effect"
import type { HttpClientError } from "effect/unstable/http/HttpClientError"
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
	readonly durationMs: number
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

export type GameMatchRound = Data.TaggedEnum<{
	InProgress: {
		readonly id: number
		readonly startedAt: number
		readonly durationMs: number
		readonly turnOrder: ReadonlyArray<string>
		readonly activePlayerIndex: number
		readonly activePlayerId: string
		readonly scores: ReadonlyArray<ScoreEntry>
	}
	Ended: {
		readonly id: number
		readonly startedAt: number
		readonly endedAt: number
		readonly durationMs: number
		readonly turnOrder: ReadonlyArray<string>
		readonly scores: ReadonlyArray<ScoreEntry>
	}
}>
export const GameMatchRound = Data.taggedEnum<GameMatchRound>()

const GameStateSnapshotTypeId = "~GameStateMachine/GameStateSnapshot"
export interface GameStateSnapshot {
	[GameStateSnapshotTypeId]: typeof GameStateSnapshotTypeId
	readonly matchId: string | null
	readonly startedAt: number | null
	readonly phase: GameMatchPhase
	readonly players: ReadonlyArray<LobbyPlayer>
	readonly rounds: ReadonlyArray<GameMatchRound>
	readonly currentRoundId: number | null
	readonly scoreLedger: ReadonlyArray<ScoreEntry>
	readonly nextRoundId: number
	readonly nextScoreEntryId: number
}

export type GameState = Data.TaggedEnum<{
	Active: {
		readonly snapshot: GameStateSnapshot
	}
	Crashed: {
		readonly cause: CurrentRoundNotFound
	}
}>
export const GameState = Data.taggedEnum<GameState>()

const { Active: makeActiveGameState, Crashed: makeCrashedGameState } = Data.taggedEnum<GameState>()
const makeStateSnapshot = (
	state: Omit<GameStateSnapshot, typeof GameStateSnapshotTypeId> | GameStateSnapshot
): GameStateSnapshot => ({
	[GameStateSnapshotTypeId]: GameStateSnapshotTypeId,
	...state
})

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
		roundId: number
		playerId: string
		path: Path
	}
	advanceTurn: {
		reason: AdvanceTurnReason
	}
	endRound: {
		roundId: number
		reason: RoundEndReason
		endedAt: number
	}
	resetMatch: {}
}>
export const GameAction = Data.taggedEnum<GameAction>()

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

const createInitialSnapshot = (): GameStateSnapshot =>
	makeStateSnapshot({
		matchId: null,
		startedAt: null,
		phase: GameMatchPhase.InLobby,
		players: [],
		rounds: [],
		currentRoundId: null,
		scoreLedger: [],
		nextRoundId: 1,
		nextScoreEntryId: 1
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
	const rounds = yield* updateRounds(
		GameMatchRound.InProgress({
			id: state.nextRoundId,
			startedAt: Date.now(),
			durationMs: config.durationMs,
			turnOrder,
			activePlayerIndex: 0,
			activePlayerId: turnOrder[0],
			scores: []
		}),
		{ allowNew: true, skipRefUpdate: true }
	)
	return yield* updateSnapshot({
		currentRoundId: state.nextRoundId,
		nextRoundId: state.nextRoundId + 1,
		rounds
	})
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

	if (!options.skipRefUpdate) yield* updateSnapshot({ rounds })
	return rounds
})

class LastMachineAction extends Context.Service<LastMachineAction, GameAction>()("LastMachineAction") {}
class StateSnapshotRef extends Context.Service<StateSnapshotRef, Ref.Ref<GameStateSnapshot>>()("StateSnapshot") {}

const getCurrentRound = Effect.gen(function*() {
	const snapshot = yield* Ref.get(yield* StateSnapshotRef)
	const action = yield* LastMachineAction
	const round = snapshot.currentRoundId
		? snapshot.rounds.find((round) => round.id === snapshot.currentRoundId) ?? null
		: null
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
	return yield* updateSnapshot({
		phase: GameMatchPhase.BetweenRounds,
		rounds: yield* updateRounds(
			GameMatchRound.Ended({
				id: currentRound.id,
				durationMs: currentRound.durationMs,
				startedAt: currentRound.startedAt,
				endedAt: Date.now(),
				turnOrder: currentRound.turnOrder,
				scores: currentRound.scores
			}),
			{ skipRefUpdate: true }
		)
	})
})

const transitionToNextPlayerTurn = Effect.gen(function*() {
	const snapshot = yield* Ref.get(yield* StateSnapshotRef)
	const currentRound = yield* getCurrentRound
	if (GameMatchRound.$is("Ended")(currentRound)) {
		return yield* new RoundInactive({
			message: "Cannot advance player turn when current round has ended ended",
			state: snapshot
		})
	}
	const currentPlayer = currentRound.activePlayerIndex
	const nextPlayerIdx = currentPlayer + 1
	if (nextPlayerIdx >= currentRound.turnOrder.length) {
		return yield* transitionToEndOfRound
	}
	const nextPlayerId = currentRound.turnOrder[nextPlayerIdx]
	yield* updateRounds(GameMatchRound.InProgress({
		...currentRound,
		activePlayerIndex: nextPlayerIdx,
		activePlayerId: nextPlayerId
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

const setPlayerRoundScore = Effect.fn(function*(
	playerId: string,
	roundId: number,
	path: Path
) {
	const state = yield* Ref.get(yield* StateSnapshotRef)
	const board = yield* BoardService.BoardService
	if (!state.rounds.find((round) => round.id === roundId)) {
		return yield* new RoundInactive({
			message: `Failed to find round with ID ${roundId} when setting player score for player ${playerId}`,
			state
		})
	}
	const playerIndex = state.players.findIndex((player) => player.id === playerId)
	if (playerIndex === -1) {
		return yield* new InvalidActor({
			message: `Failed to find player with ID ${playerId} when setting round score for player`,
			action: yield* LastMachineAction
		})
	}
	const scoreEntry: ScoreEntry = {
		id: `claim-${state.nextScoreEntryId}`,
		playerId,
		roundId,
		points: path.reduce((score, pathNode) => score + board.getTileScore(pathNode), 0),
		word: path.map((node) => node.letter).join(""),
		path,
		submittedAtMs: Date.now()
	}
	const nextRoundsState = [
		...state.rounds.map((round) =>
			round.id === roundId ?
				{
					...round,
					scores: [...round.scores, scoreEntry]
				} :
				round
		)
	]
	const nextPlayersState = [
		...state.players.map((player) =>
			player.id === playerId
				? { ...player, score: player.score + scoreEntry.points }
				: player
		)
	]
	return yield* updateSnapshot({
		...state,
		rounds: nextRoundsState,
		players: nextPlayersState,
		scoreLedger: [...state.scoreLedger, scoreEntry],
		nextScoreEntryId: state.nextScoreEntryId + 1
	})
})

export const reduceGameState = (
	state: GameStateSnapshot,
	action: GameAction
) =>
	Effect.gen(function*() {
		const nextState = yield* Match.value(action).pipe(
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
						return yield* updateSnapshot({
							players: upsertPlayer(state.players, {
								id: player.id,
								name: player.name,
								ready: ready ?? false,
								score: 0,
								joinedAt: Date.now()
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
									startedAt: Date.now(),
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
						const round = yield* getCurrentRound
						if (GameMatchRound.$is("Ended")(round)) {
							return yield* new RoundInactive({
								message: "Cannot submit word when round is not active",
								state
							})
						}
						if (round.id !== submitAction.roundId) {
							return yield* new RoundInactive({
								message: "Cannot submit word for round that is not the current round",
								state
							})
						}
						if (!GameAction.$is("submitWord")(action)) {
							return yield* new InvalidStateTransition({
								message: "Cannot score submitted word when last machine action was not a word submission",
								action,
								state
							})
						}
						const board = yield* BoardService.BoardService
						const word = action.path.map((node) => node.letter).join("")
						if (word.trim().length === 0) {
							return yield* new EmptyWordSubmitted({
								message: "Cannot submit empty word"
							})
						}
						if (state.players.find((player) => player.id === action.playerId) === undefined) {
							return yield* new InvalidActor({
								message: "Player submitting word is not part of the game",
								action: action
							})
						}
						if (
							state.scoreLedger.some((entry) =>
								entry.roundId === action.roundId
								&& entry.playerId === action.playerId
							)
						) {
							return yield* new InvalidActor({
								message: "Player has already submitted a word for this round",
								action
							})
						}
						const boardSolutions = yield* Atom.getResult(board.boardSolutions)
						if (!boardSolutions.words.has(word)) {
							return yield* new InvalidWordSubmitted({
								message: `\"${word}\" is not a valid word for the current board`
							})
						}
						yield* setPlayerRoundScore(action.playerId, action.roundId, action.path)
						yield* transitionToNextPlayerTurn
						return yield* Ref.get(yield* StateSnapshotRef) // todo cleanup
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
						yield* transitionToNextPlayerTurn
						return yield* Ref.get(yield* StateSnapshotRef) // todo cleanup
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
						yield* transitionToEndOfRound
						return yield* Ref.get(yield* StateSnapshotRef) // todo cleanup
					}),
				resetMatch: () => Effect.sync(createInitialSnapshot)
			}),
			Effect.provideService(StateSnapshotRef, yield* Ref.make(state)),
			Effect.provideService(LastMachineAction, action)
		)
		yield* Effect.log(`Game State updated`, { action, nextState })
		return nextState
	})
type FnRequirements<Fn extends (...args: any[]) => Effect.Effect<any, any, any>> = Effect.Services<ReturnType<Fn>>
export const make = Effect.fn(
	function*(runtime: Atom.AtomRuntime<FnRequirements<typeof reduceGameState>, HttpClientError>) {
		const initialValue = createInitialSnapshot()
		// todo: gameState should maybe not be initialized till the runtime is done (so that we have wordlist)
		const gameState = Atom.make<GameState>(makeActiveGameState({ snapshot: initialValue }))
		const reduceFn = runtime.fn(Effect.fn(function*(action: GameAction, get: Atom.FnContext) {
			const current = get(gameState)
			if (GameState.$is("Crashed")(current)) {
				return false
			}
			const next = yield* pipe(
				reduceGameState(current.snapshot, action),
				Effect.map((nextSnapshot) => {
					return current.snapshot !== nextSnapshot
						? makeActiveGameState({ snapshot: nextSnapshot })
						: current
				}),
				Effect.catchTags({
					"CurrentRoundNotFound": (cause) => Effect.succeed(makeCrashedGameState({ cause }))
				})
			)
			get.set(gameState, next)
			return true
		}))
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

export const getPlayerById = (
	state: GameStateSnapshot,
	playerId: string
): LobbyPlayer | null => state.players.find((player) => player.id === playerId) ?? null

export const getPlayerScore = (
	state: GameStateSnapshot,
	playerId: string
): number => getPlayerById(state, playerId)?.score ?? 0

export const getRoundById = (
	state: GameStateSnapshot,
	roundId: number
): GameMatchRound | null => state.rounds.find((round) => round.id === roundId) ?? null

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
