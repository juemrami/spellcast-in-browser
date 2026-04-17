import { Context, Data, Effect, Match, pipe, Predicate } from "effect"
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
export interface GameRound {
	readonly id: number
	readonly status: RoundStatus
	readonly startedAt: number
	readonly endedAt: number | null
	readonly durationMs: number
	readonly turnOrder: ReadonlyArray<string>
	readonly activePlayerIndex: number | null
	readonly activePlayerId: string | null
	// readonly boardSeed: string | null
	readonly scoreEntries: ReadonlyArray<ScoreEntry>
}

const GameStateSnapshotTypeId = "~GameStateMachine/GameStateSnapshot"
export interface GameStateSnapshot {
	[GameStateSnapshotTypeId]: typeof GameStateSnapshotTypeId
	readonly matchId: string | null
	readonly startedAt: number | null
	readonly phase: GameMatchPhase
	readonly players: ReadonlyArray<LobbyPlayer>
	readonly rounds: ReadonlyArray<GameRound>
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
	startMatch: {
		matchId: string
		roundConfig: GameMatchRoundConfig
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
		roundId: number
		reason: AdvanceTurnReason
		nextPlayerId?: string
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

const getCurrentRound = (state: GameStateSnapshot): GameRound | null => {
	return state.currentRoundId
		? state.rounds.find((round) => round.id === state.currentRoundId) ?? null
		: null
}

const upsertPlayer = (
	players: ReadonlyArray<LobbyPlayer>,
	player: LobbyPlayer
): Array<LobbyPlayer> => {
	const existingPlayerIndex = players.findIndex((currentPlayer) => currentPlayer.id === player.id)
	if (existingPlayerIndex === -1) {
		return [...players, player]
	}

	const updatedPlayers = [...players]
	updatedPlayers[existingPlayerIndex] = {
		...updatedPlayers[existingPlayerIndex],
		name: player.name,
		ready: player.ready,
		joinedAt: updatedPlayers[existingPlayerIndex].joinedAt ?? player.joinedAt
	}
	return updatedPlayers
}

const updatePlayerScore = (
	players: ReadonlyArray<LobbyPlayer>,
	playerId: string,
	points: number
): Array<LobbyPlayer> => {
	const playerIndex = players.findIndex((player) => player.id === playerId)
	if (playerIndex === -1) {
		return [...players]
	}

	const updatedPlayers = [...players]
	updatedPlayers[playerIndex] = {
		...updatedPlayers[playerIndex],
		score: updatedPlayers[playerIndex].score + points
	}
	return updatedPlayers
}

const makeRound = Effect.fn(function*(
	state: GameStateSnapshot,
	config: GameMatchRoundConfig
) {
	if (state.players.length < MIN_PLAYERS) {
		yield* new NotEnoughPlayers({ message: `At least ${MIN_PLAYERS} players are required to start a round` })
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
	return {
		id: state.nextRoundId,
		status: RoundStatus.Active,
		startedAt: Date.now(),
		endedAt: null,
		durationMs: config.durationMs,
		turnOrder,
		activePlayerIndex: 0,
		activePlayerId: turnOrder[0],
		// boardSeed: config.boardSeed ?? (yield* Random.nextInt),
		scoreEntries: []
	} satisfies GameRound
})

const replaceRound = (
	rounds: ReadonlyArray<GameRound>,
	updatedRound: GameRound
): Array<GameRound> => rounds.map((round) => (round.id === updatedRound.id ? updatedRound : round))

const appendRoundAndAdvanceCounter = (
	state: GameStateSnapshot,
	round: GameRound
): GameStateSnapshot => ({
	...state,
	phase: GameMatchPhase.InRound,
	startedAt: state.startedAt ?? round.startedAt,
	rounds: [...state.rounds, round],
	currentRoundId: round.id,
	nextRoundId: state.nextRoundId + 1
})

export const createGameStateSnapshot = createInitialSnapshot

export const reduceGameState = (
	state: GameStateSnapshot,
	action: GameAction
) =>
	Effect.gen(function*() {
		const board = yield* BoardService.BoardService
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
						return {
							...state,
							players: upsertPlayer(state.players, {
								id: player.id,
								name: player.name,
								ready: ready ?? false,
								score: 0,
								joinedAt: Date.now()
							})
						}
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
						return {
							...state,
							players: state.players.filter((player) => player.id !== playerId)
						}
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
						return {
							...state,
							players: state.players.map((player) =>
								player.id === playerId
									? { ...player, ready }
									: player
							)
						}
					}),
				startMatch: ({ matchId, roundConfig }) =>
					Effect.gen(function*() {
						if (state.phase !== GameMatchPhase.InLobby) {
							return yield* new InvalidStateTransition({
								message: "Cannot start match when game is out of lobby",
								action,
								state
							})
						}
						if (state.players.length < MIN_PLAYERS) {
							return yield* new NotEnoughPlayers({
								message: `At least ${MIN_PLAYERS} players are required to start the match`
							})
						}
						const round = yield* makeRound(state, roundConfig)
						return appendRoundAndAdvanceCounter(
							{
								...state,
								matchId,
								startedAt: round.startedAt
							},
							round
						)
					}),
				startRound: ({ config }) =>
					Effect.gen(function*() {
						if (state.phase !== GameMatchPhase.BetweenRounds) {
							return yield* new InvalidStateTransition({
								message: "Cannot start round when game is not between rounds",
								action,
								state
							})
						}

						const nextRound = yield* makeRound(state, config)
						return appendRoundAndAdvanceCounter(state, nextRound)
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
						const round = getCurrentRound(state)
						if (round === null) {
							return yield* new CurrentRoundNotFound({
								message: "Round not found for current game when trying to submit word",
								state
							})
						}
						if (round.status !== RoundStatus.Active) {
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
						const word = submitAction.path.map((node) => node.letter).join("")
						if (word.trim().length === 0) {
							return yield* new EmptyWordSubmitted({
								message: "Cannot submit empty word"
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
								entry.roundId === submitAction.roundId
								&& entry.playerId === submitAction.playerId
							)
						) {
							return yield* new InvalidActor({
								message: "Player has already submitted a word for this round",
								action: submitAction
							})
						}
						const boardSolutions = yield* Atom.getResult(board.boardSolutions)
						if (!boardSolutions.words.has(word)) {
							return yield* new InvalidWordSubmitted({
								message: `\"${word}\" is not a valid word for the current board`
							})
						}
						const scoreEntry: ScoreEntry = {
							id: `claim-${state.nextScoreEntryId}`,
							playerId: submitAction.playerId,
							roundId: round.id,
							points: submitAction.path.reduce((score, pathNode) => score + board.getTileScore(pathNode), 0),
							word: word,
							path: submitAction.path,
							submittedAtMs: Date.now()
						}
						const updatedRound: GameRound = {
							...round,
							scoreEntries: [...round.scoreEntries, scoreEntry]
						}
						return {
							...state,
							players: updatePlayerScore(state.players, submitAction.playerId, scoreEntry.points),
							rounds: replaceRound(state.rounds, updatedRound),
							scoreLedger: [...state.scoreLedger, scoreEntry],
							nextScoreEntryId: state.nextScoreEntryId + 1
						}
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
						const round = getCurrentRound(state)
						if (round === null) {
							return yield* new CurrentRoundNotFound({
								message: "Round not found for current game when trying to advance turn",
								state
							})
						}
						if (round.status !== RoundStatus.Active) {
							return yield* new RoundInactive({
								message: "Cannot advance turn when current round is not active",
								state
							})
						}
						if (round.id !== turnAction.roundId) {
							return yield* new RoundInactive({
								message: `Cannot advance turn for round ${turnAction.roundId}. It is not the current round`,
								state
							})
						}
						const nextPlayerIndex = turnAction.nextPlayerId !== undefined
							? round.turnOrder.indexOf(turnAction.nextPlayerId)
							: round.activePlayerIndex === null
							? 0
							: (round.activePlayerIndex + 1) % round.turnOrder.length

						if (nextPlayerIndex < 0) {
							return yield* new InvalidStateTransition({
								message: `Next player ID ${turnAction.nextPlayerId} is not in the turn order for the current round`,
								action: turnAction,
								state
							})
						}
						const nextRound: GameRound = {
							...round,
							activePlayerIndex: nextPlayerIndex,
							activePlayerId: round.turnOrder[nextPlayerIndex] ?? null
						}
						return {
							...state,
							rounds: replaceRound(state.rounds, nextRound)
						}
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
						const round = getCurrentRound(state)
						if (round === null) {
							return yield* new CurrentRoundNotFound({
								message: "Round not found for current game when trying to end round",
								state
							})
						}
						if (round.status !== RoundStatus.Active) {
							return yield* new RoundInactive({
								message: "Cannot end current round when it is not active",
								state
							})
						}
						if (round.id !== endAction.roundId) {
							return yield* new RoundInactive({
								message: `Cannot end round for round ${endAction.roundId}. It is not the current round`,
								state
							})
						}
						const endedRound: GameRound = {
							...round,
							status: RoundStatus.Ended,
							endedAt: endAction.endedAt
						}
						return {
							...state,
							phase: GameMatchPhase.BetweenRounds,
							rounds: replaceRound(state.rounds, endedRound)
						}
					}),
				resetMatch: () => Effect.sync(createInitialSnapshot)
			})
		)
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
): GameRound | null => state.rounds.find((round) => round.id === roundId) ?? null

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
