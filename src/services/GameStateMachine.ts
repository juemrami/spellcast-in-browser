import { Context, type Data, Effect, Match } from "effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Path } from "../types/game"

export const MIN_PLAYERS = 1

export const GamePhase = {
	InLobby: "lobby",
	InRound: "in-round",
	BetweenRounds: "between-rounds"
} as const
export type GamePhase = typeof GamePhase[keyof typeof GamePhase]

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

export interface RoundStartInput {
	readonly startedAt: number
	readonly durationMs: number
	readonly turnOrder: ReadonlyArray<string>
	readonly boardSeed?: string | null
}

export interface ScoreEntry {
	readonly id: string
	readonly playerId: string
	readonly roundId: number
	readonly points: number
	readonly word: string
	readonly path: Path
	readonly submittedAt: number
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
	readonly boardSeed: string | null
	readonly scoreEntries: ReadonlyArray<ScoreEntry>
}

export interface GameStateSnapshot {
	readonly matchId: string | null
	readonly startedAt: number | null
	readonly phase: GamePhase
	readonly players: ReadonlyArray<LobbyPlayer>
	readonly rounds: ReadonlyArray<GameRound>
	readonly currentRoundId: number | null
	readonly scoreLedger: ReadonlyArray<ScoreEntry>
	readonly nextRoundId: number
	readonly nextScoreEntryId: number
}

export type GameStateAction = Data.TaggedEnum<{
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
		round: RoundStartInput
	}
	startRound: {
		round: RoundStartInput
	}
	submitWord: {
		roundId: number
		playerId: string
		word: string
		path: Path
		points: number
		submittedAt: number
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

const createInitialGameState = (): GameStateSnapshot => ({
	matchId: null,
	startedAt: null,
	phase: GamePhase.InLobby,
	players: [],
	rounds: [],
	currentRoundId: null,
	scoreLedger: [],
	nextRoundId: 1,
	nextScoreEntryId: 1
})
/** * Normalizes the turn order by filtering out invalid player IDs and duplicates while preserving the original order.
 *
 * @param turnOrder - The original turn order as an array of player IDs.
 * @param players - The list of current players in the lobby.
 * @returns A normalized array of player IDs representing the turn order.
 */
const normalizeTurnOrder = (
	turnOrder: ReadonlyArray<string>,
	players: ReadonlyArray<LobbyPlayer>
): Array<string> => {
	const allowedPlayerIds = new Set(players.map((player) => player.id))
	const seen = new Set<string>()
	const normalized: Array<string> = []

	for (const playerId of turnOrder) {
		if (!allowedPlayerIds.has(playerId) || seen.has(playerId)) {
			continue
		}
		seen.add(playerId)
		normalized.push(playerId)
	}

	return normalized
}

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

const createRound = (
	state: GameStateSnapshot,
	roundInput: RoundStartInput
): GameRound | null => {
	const turnOrder = normalizeTurnOrder(roundInput.turnOrder, state.players)
	if (turnOrder.length === 0) {
		return null
	}

	return {
		id: state.nextRoundId,
		status: RoundStatus.Active,
		startedAt: roundInput.startedAt,
		endedAt: null,
		durationMs: roundInput.durationMs,
		turnOrder,
		activePlayerIndex: 0,
		activePlayerId: turnOrder[0] ?? null,
		boardSeed: roundInput.boardSeed ?? null,
		scoreEntries: []
	}
}

const replaceRound = (
	rounds: ReadonlyArray<GameRound>,
	updatedRound: GameRound
): Array<GameRound> => rounds.map((round) => (round.id === updatedRound.id ? updatedRound : round))

const appendRoundAndAdvanceCounter = (
	state: GameStateSnapshot,
	round: GameRound
): GameStateSnapshot => ({
	...state,
	phase: GamePhase.InRound,
	startedAt: state.startedAt ?? round.startedAt,
	rounds: [...state.rounds, round],
	currentRoundId: round.id,
	nextRoundId: state.nextRoundId + 1
})

export const createGameStateSnapshot = createInitialGameState

export const reduceGameState = (
	state: GameStateSnapshot,
	action: GameStateAction
): GameStateSnapshot => {
	const nextState = Match.value(action).pipe(
		Match.tagsExhaustive({
			joinLobby: ({ player, ready }) => {
				if (state.phase !== GamePhase.InLobby) {
					return state
				}
				const joinedAt = Date.now()
				return {
					...state,
					players: upsertPlayer(state.players, {
						id: player.id,
						name: player.name,
						ready: ready ?? false,
						score: 0,
						joinedAt
					})
				}
			},
			leaveLobby: ({ playerId }) => {
				if (state.phase !== GamePhase.InLobby) {
					return state
				}

				return {
					...state,
					players: state.players.filter((player) => player.id !== playerId)
				}
			},
			setReady: ({ playerId, ready }) => {
				if (state.phase !== GamePhase.InLobby) {
					return state
				}

				return {
					...state,
					players: state.players.map((player) =>
						player.id === playerId
							? { ...player, ready }
							: player
					)
				}
			},
			startMatch: ({ matchId, round }) => {
				if (state.phase !== GamePhase.InLobby || state.players.length < MIN_PLAYERS) {
					return state
				}

				const nextRound = createRound(state, round)
				if (nextRound === null) {
					return state
				}

				return appendRoundAndAdvanceCounter(
					{
						...state,
						matchId,
						startedAt: nextRound.startedAt
					},
					nextRound
				)
			},
			startRound: ({ round }) => {
				if (state.phase !== GamePhase.BetweenRounds) {
					return state
				}

				const nextRound = createRound(state, round)
				if (nextRound === null) {
					return state
				}

				return appendRoundAndAdvanceCounter(state, nextRound)
			},
			submitWord: (submitAction) => {
				if (state.phase !== GamePhase.InRound) {
					return state
				}

				const round = getCurrentRound(state)
				if (round === null || round.status !== RoundStatus.Active || round.id !== submitAction.roundId) {
					return state
				}
				if (round.activePlayerId !== null && round.activePlayerId !== submitAction.playerId) {
					return state
				}
				if (submitAction.word.trim().length === 0 || submitAction.points < 0) {
					return state
				}
				if (state.players.find((player) => player.id === submitAction.playerId) === undefined) {
					return state
				}
				if (
					state.scoreLedger.some((entry) =>
						entry.roundId === submitAction.roundId
						&& entry.playerId === submitAction.playerId
						&& entry.word === submitAction.word
					)
				) {
					return state
				}

				const scoreEntry: ScoreEntry = {
					id: `claim-${state.nextScoreEntryId}`,
					playerId: submitAction.playerId,
					roundId: submitAction.roundId,
					points: submitAction.points,
					word: submitAction.word,
					path: submitAction.path,
					submittedAt: submitAction.submittedAt
				}

				const updatedRound: GameRound = {
					...round,
					scoreEntries: [...round.scoreEntries, scoreEntry]
				}

				return {
					...state,
					players: updatePlayerScore(state.players, submitAction.playerId, submitAction.points),
					rounds: replaceRound(state.rounds, updatedRound),
					scoreLedger: [...state.scoreLedger, scoreEntry],
					nextScoreEntryId: state.nextScoreEntryId + 1
				}
			},
			advanceTurn: (turnAction) => {
				if (state.phase !== GamePhase.InRound) {
					return state
				}

				const round = getCurrentRound(state)
				if (
					round === null || round.status !== RoundStatus.Active || round.id !== turnAction.roundId ||
					round.turnOrder.length === 0
				) {
					return state
				}

				const nextPlayerIndex = turnAction.nextPlayerId !== undefined
					? round.turnOrder.indexOf(turnAction.nextPlayerId)
					: round.activePlayerIndex === null
					? 0
					: (round.activePlayerIndex + 1) % round.turnOrder.length

				if (nextPlayerIndex < 0) {
					return state
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
			},
			endRound: (endAction) => {
				if (state.phase !== GamePhase.InRound) {
					return state
				}

				const round = getCurrentRound(state)
				if (round === null || round.status !== RoundStatus.Active || round.id !== endAction.roundId) {
					return state
				}

				const endedRound: GameRound = {
					...round,
					status: RoundStatus.Ended,
					endedAt: endAction.endedAt
				}

				return {
					...state,
					phase: GamePhase.BetweenRounds,
					rounds: replaceRound(state.rounds, endedRound)
				}
			},
			resetMatch: () => createInitialGameState()
		})
	) satisfies GameStateSnapshot
	return nextState
}
/** Atom wrapped state machine for a single game/match */
export class GameStateMachine
	extends Context.Service<GameStateMachine, Atom.Writable<GameStateSnapshot, GameStateAction>>()(
		"server/GameStateMachine"
	)
{}

export const make = Effect.sync(() => {
	const state = Atom.writable<GameStateSnapshot, GameStateAction>(
		() => createInitialGameState(),
		(ctx, action) => {
			const currentState = ctx.get(state)
			const nextState = reduceGameState(currentState, action)
			if (nextState !== currentState) {
				ctx.setSelf(nextState)
			}
		}
	)

	return GameStateMachine.of(state)
})

export const layerFresh = Layer.fresh(Layer.effect(GameStateMachine, make))

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

export const getCurrentRoundSnapshot = getCurrentRound
