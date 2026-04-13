import { Context, Effect } from "effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Path } from "../types/game"

export type GamePhase = "lobby" | "in-round" | "between-rounds"
export type RoundStatus = "active" | "ended"
export type RoundEndReason = "timer" | "manual" | "board-exhausted"
export type AdvanceTurnReason = "word-submitted" | "timer" | "manual"

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

export interface GameStateService {
	readonly state: Atom.Writable<GameStateSnapshot, GameStateAction>
}

export type GameStateAction =
	| {
		type: "joinLobby"
		player: {
			readonly id: string
			readonly name: string
		}
		joinedAt?: number
		ready?: boolean
	}
	| {
		type: "leaveLobby"
		playerId: string
	}
	| {
		type: "setReady"
		playerId: string
		ready: boolean
	}
	| {
		type: "startMatch"
		matchId: string
		round: RoundStartInput
	}
	| {
		type: "startRound"
		round: RoundStartInput
	}
	| {
		type: "submitWord"
		roundId: number
		playerId: string
		word: string
		path: Path
		points: number
		submittedAt: number
	}
	| {
		type: "advanceTurn"
		roundId: number
		reason: AdvanceTurnReason
		nextPlayerId?: string
	}
	| {
		type: "endRound"
		roundId: number
		reason: RoundEndReason
		endedAt: number
	}
	| {
		type: "resetMatch"
	}

const createInitialGameState = (): GameStateSnapshot => ({
	matchId: null,
	startedAt: null,
	phase: "lobby",
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
		status: "active",
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
	phase: "in-round",
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
	switch (action.type) {
		case "joinLobby": {
			if (state.phase !== "lobby") {
				return state
			}

			const nextPlayer: LobbyPlayer = {
				id: action.player.id,
				name: action.player.name,
				ready: action.ready ?? false,
				score: 0,
				joinedAt: action.joinedAt ?? null
			}

			return {
				...state,
				players: upsertPlayer(state.players, nextPlayer)
			}
		}
		case "leaveLobby": {
			if (state.phase !== "lobby") {
				return state
			}

			return {
				...state,
				players: state.players.filter((player) => player.id !== action.playerId)
			}
		}
		case "setReady": {
			if (state.phase !== "lobby") {
				return state
			}

			return {
				...state,
				players: state.players.map((player) =>
					player.id === action.playerId
						? { ...player, ready: action.ready }
						: player
				)
			}
		}
		case "startMatch": {
			if (state.phase !== "lobby" || state.players.length === 0 || state.players.some((player) => !player.ready)) {
				return state
			}

			const round = createRound(state, action.round)
			if (round === null) {
				return state
			}

			return appendRoundAndAdvanceCounter(
				{
					...state,
					matchId: action.matchId,
					startedAt: round.startedAt
				},
				round
			)
		}
		case "startRound": {
			if (state.phase !== "between-rounds") {
				return state
			}

			const round = createRound(state, action.round)
			if (round === null) {
				return state
			}

			return appendRoundAndAdvanceCounter(state, round)
		}
		case "submitWord": {
			if (state.phase !== "in-round") {
				return state
			}

			const round = getCurrentRound(state)
			if (round === null || round.status !== "active" || round.id !== action.roundId) {
				return state
			}
			if (round.activePlayerId !== null && round.activePlayerId !== action.playerId) {
				return state
			}
			if (action.word.trim().length === 0 || action.points < 0) {
				return state
			}
			if (state.players.find((player) => player.id === action.playerId) === undefined) {
				return state
			}
			if (
				state.scoreLedger.some((entry) =>
					entry.roundId === action.roundId
					&& entry.playerId === action.playerId
					&& entry.word === action.word
				)
			) {
				return state
			}

			const scoreEntry: ScoreEntry = {
				id: `claim-${state.nextScoreEntryId}`,
				playerId: action.playerId,
				roundId: action.roundId,
				points: action.points,
				word: action.word,
				path: action.path,
				submittedAt: action.submittedAt
			}

			const updatedRound: GameRound = {
				...round,
				scoreEntries: [...round.scoreEntries, scoreEntry]
			}

			return {
				...state,
				players: updatePlayerScore(state.players, action.playerId, action.points),
				rounds: replaceRound(state.rounds, updatedRound),
				scoreLedger: [...state.scoreLedger, scoreEntry],
				nextScoreEntryId: state.nextScoreEntryId + 1
			}
		}
		case "advanceTurn": {
			if (state.phase !== "in-round") {
				return state
			}

			const round = getCurrentRound(state)
			if (round === null || round.status !== "active" || round.id !== action.roundId || round.turnOrder.length === 0) {
				return state
			}

			const nextPlayerIndex = action.nextPlayerId !== undefined
				? round.turnOrder.indexOf(action.nextPlayerId)
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
		}
		case "endRound": {
			if (state.phase !== "in-round") {
				return state
			}

			const round = getCurrentRound(state)
			if (round === null || round.status !== "active" || round.id !== action.roundId) {
				return state
			}

			const endedRound: GameRound = {
				...round,
				status: "ended",
				endedAt: action.endedAt
			}

			return {
				...state,
				phase: "between-rounds",
				rounds: replaceRound(state.rounds, endedRound)
			}
		}
		case "resetMatch": {
			return createInitialGameState()
		}
	}
}

export class GameState extends Context.Service<GameState, GameStateService>()("spellcast/GameState") {}

export const make = Effect.sync(() => {
	let matchState!: Atom.Writable<GameStateSnapshot, GameStateAction>

	matchState = Atom.writable(
		() => createInitialGameState(),
		(ctx, action) => {
			const currentState = ctx.get(matchState)
			const nextState = reduceGameState(currentState, action)
			if (nextState !== currentState) {
				ctx.setSelf(nextState)
			}
		}
	)

	return GameState.of({
		state: matchState
	})
})

export const layerFresh = Layer.fresh(Layer.effect(GameState, make))

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
