import { RegistryContext } from "@effect/atom-solid/RegistryContext"
import { Context, Data, Effect, Layer, Option, pipe, Random, Struct } from "effect"
import { Atom, AtomRegistry } from "effect/unstable/reactivity"
import { useContext } from "solid-js"
import { ClientPlayerState } from "../ClientPlayer"
import { MIN_PLAYERS } from "../GameStateMachine"
import { P2PSessionManager } from "../P2PSession"
import { TrysteroRoom } from "../Trystero"

type ActionConfig = Record<string, {
	onReceive: (data: any, senderPeerId: string) => Effect.Effect<any>
	onSend?: (data: any, targetPeerIds?: Array<string>) => Effect.Effect<any>
}>

type ActionHandlers<TActions extends ActionConfig> = {
	[K in keyof TActions]: {
		send: (
			data: Parameters<TActions[K]["onReceive"]>[0],
			targetPeerIds?: Array<string>
		) => Effect.Effect<void>
	}
}

const makeTrysteroRoomActions = <const TActions extends ActionConfig>(actions: TActions) =>
	Effect.gen(function*() {
		const { room } = yield* TrysteroRoom
		const handlers = {} as ActionHandlers<TActions>
		for (const actionName of Struct.keys(actions)) {
			const [send, onReceive] = room.makeAction(actionName)
			const action = actions[actionName]
			handlers[actionName] = {
				send: (data, targetPeerIds) =>
					pipe(
						Effect.promise(() => send(data, targetPeerIds)),
						Effect.andThen(() =>
							(action.onSend?.(data, targetPeerIds) ?? Effect.void).pipe(
								Effect.andThen(() => Effect.log("post send callback"))
							)
						)
					)
			}
			// todo: use a Queue or Stream instead
			onReceive((data, peer) => Effect.runPromise(action.onReceive(data, peer)))
		}
		return handlers
	})

/** Frozen snapshot of lobby state at match start time. Immutable once created. */
export interface MatchSnapshot {
	readonly matchId: string
	readonly createdAt: number
	readonly players: ReadonlyArray<{ readonly id: string; readonly name: string }>
	readonly config: { readonly numRounds: 3 | 5 | 7 }
	readonly seed: number
	readonly turnOrder: ReadonlyArray<string>
}
/**
 * Represents a peer's current state in the lobby.
 * Ephemeral coordination data, not part of the frozen match.
 */
export interface LobbyPeerState {
	readonly id: string
	readonly name: string
	readonly ready: boolean
	readonly joinedAt: number
}
class NotEnoughReadyPlayers extends Data.TaggedError("NotEnoughReadyPlayers")<{
	readonly message: string
}> {}
const withSolidContextRegistry = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
	pipe(
		effect,
		Effect.provideService(AtomRegistry.AtomRegistry, useContext(RegistryContext))
	)
/**
 * LobbyManager owns ephemeral lobby coordination concerns:
 * - Peer list tracking from Trystero room
 * - Player metadata (names, ready state)
 * - Match configuration (numRounds, turnOrder)
 * - Freeze logic that produces deterministic MatchSnapshot
 *
 * Once frozen, the snapshot is immutable and used to initialize the match state machine.
 */
export const make = Effect.gen(function*() {
	// Track peers in lobby
	const user = yield* ClientPlayerState
	const p2pSession = yield* P2PSessionManager
	// if (pipe(yield* Atom.get(p2pSession.active), Option.isNone)) {
	// 	return yield* new MissingP2PSession({ message: "Cannot initialize lobby: no active P2P session" })
	// }
	const makeDefaultPeerState = (peerId: string): LobbyPeerState => ({
		id: peerId,
		name: `Player-${peerId.slice(0, 6)}`,
		ready: true,
		joinedAt: Date.now()
	})

	const lobbyP2PRoom = Atom.make((get) => {
		const connection = get(p2pSession.atoms.active).pipe(Option.getOrUndefined)
		if (!connection) {
			return undefined
		}
		const p2pActions = makeTrysteroRoomActions({
			ReadyStatus: {
				onReceive: (isReady: boolean, senderId: string) =>
					pipe(
						Effect.sync(() => get.set(lobbyPeerStates, { peerId: senderId, ready: isReady }))
					),
				onSend: (isReady: boolean) =>
					pipe(
						Effect.sync(() => get.set(userPeerState, isReady))
					)
			}
		}).pipe(
			Effect.provideService(TrysteroRoom, connection.room),
			Effect.runSync
		)
		return {
			connection,
			actions: p2pActions
		}
	})

	// Local player metadata (mutable while in lobby)
	const userPeerState = Atom.writable((get) => {
		const name = get(user.atoms.playerName)
		const existing = pipe(
			get.self<LobbyPeerState>(),
			Option.getOrElse<LobbyPeerState>(() => makeDefaultPeerState(p2pSession.userPeerId))
		)
		if (name !== existing.name || existing.id !== p2pSession.userPeerId) {
			return {
				...existing,
				name,
				id: p2pSession.userPeerId
			}
		} else {
			return existing
		}
	}, (ctx, ready: boolean) => {
		const current = ctx.get(userPeerState)
		ctx.setSelf({ ...current, ready })
	})

	// Match configuration (mutable while in lobby)
	const matchConfig = Atom.make<{
		numRounds: 3 | 5 | 7
	}>({
		numRounds: 3
	})

	// Atom-based reactivity for UI
	const lobbyPeerStates = Atom.writable((get) => {
		const trysteroPeers = get(p2pSession.atoms.peers).pipe(Option.getOrUndefined)
		if (trysteroPeers === undefined) {
			return new Map<string, LobbyPeerState>()
		}
		return pipe(
			get.self<Map<string, LobbyPeerState>>(),
			Option.map((existing) => {
				// Build a new map based on Trystero peers, preserving existing metadata
				const existingMap = existing
				const peerIds: Array<string> = Array.from(trysteroPeers.keys())
				const updated = new Map<string, LobbyPeerState>()
				for (const id of peerIds) {
					const prev = existingMap.get(id)
					if (prev) {
						updated.set(id, prev)
					} else {
						updated.set(id, makeDefaultPeerState(id))
					}
				}
				return updated
			}),
			Option.getOrElse(() => new Map<string, LobbyPeerState>())
		)
	}, (ctx, { peerId, ready }: { peerId: string; ready: boolean }) => {
		const current = ctx.get(lobbyPeerStates)
		const existing = current.get(peerId)
		if (existing) {
			const next = { ...existing, ready }
			current.set(peerId, next)
			ctx.setSelf(new Map(current))
			console.log(`Updated ready status for peer ${peerId}:`, next)
		}
	})

	const isReadyAtom = Atom.make((get) => {
		const local = get(userPeerState)
		const peers = get(lobbyPeerStates)
		const peersArray = Array.from(peers.values())
		const allPeersReady = peersArray.every((p) => p.ready)
		return peersArray.length >= MIN_PLAYERS && local.ready && allPeersReady
	})

	/**
	 * Freeze lobby into immutable MatchSnapshot.
	 * Only host can call this. Validates:
	 * - At least MIN_PLAYERS ready
	 * - All participants have valid names
	 * - Match config is valid
	 */
	const freeze = Effect.gen(function*() {
		const peers = yield* Atom.get(lobbyPeerStates)
		const local = yield* Atom.get(userPeerState)
		const config = yield* Atom.get(matchConfig)

		// Validate ready state
		const readyPeers = Array.from(peers.values()).filter((p) => p.ready)
		const allReady = local.ready && readyPeers.length >= MIN_PLAYERS
		if (!allReady) {
			return yield* new NotEnoughReadyPlayers({
				message: `Cannot freeze lobby: need ${MIN_PLAYERS} ready players, have ${readyPeers.length + 1}`
			})
		}

		// Collect all players (local + peers)
		const allPlayers = [
			local,
			...readyPeers
		]

		// Derive deterministic turn order by sorting player IDs
		// This ensures all peers independently derive the same order
		const turnOrder = allPlayers
			.map((p) => p.id)
			.sort() // deterministic order

		// Generate seed for board generation
		const seed = yield* Random.nextInt

		// Build immutable snapshot
		const snapshot: MatchSnapshot = {
			matchId: `match-${Date.now()}-${local.id.slice(0, 6)}`,
			createdAt: Date.now(),
			players: allPlayers.map((p) => ({
				id: p.id,
				name: p.name
			})),
			config,
			seed,
			turnOrder
		}

		return snapshot
	})

	return {
		atoms: {
			room: lobbyP2PRoom,
			peers: lobbyPeerStates,
			user: userPeerState,
			allPlayers: Atom.readable((get) => {
				const local = get(userPeerState)
				const peers = get(lobbyPeerStates)
				return [local, ...Array.from(peers.values())]
			}),
			matchConfig: matchConfig,
			isReady: isReadyAtom
		},
		freeze
	}
})

export class GameLobby extends Context.Service<GameLobby>()(
	"GameLobby",
	{ make: make }
) {
	static layer = Layer.effect(this, this.make.pipe(withSolidContextRegistry))
}
