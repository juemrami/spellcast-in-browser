import { RegistryContext } from "@effect/atom-solid"
import { Context, Data, Effect, HashMap, pipe, Predicate, Queue, Ref, Stream } from "effect"
import type { JsonValue } from "effect/testing/FastCheck"
import { Atom, AtomRegistry } from "effect/unstable/reactivity"
import { useContext } from "solid-js"
import { joinRoom, type Room } from "trystero"

export type PeerEvent = Data.TaggedEnum<{
	Join: { readonly peerId: string }
	Leave: { readonly peerId: string }
	MediaStream: { readonly peerId: string; readonly stream: MediaStream; readonly metadata: JsonValue | undefined }
	MediaStreamTrack: {
		readonly peerId: string
		readonly track: MediaStreamTrack
		readonly stream: MediaStream
		readonly metadata: JsonValue | undefined
	}
}>
const base = Data.taggedEnum<PeerEvent>()
const PeerEvent = Object.assign(base, {
	isJoinLeave: Predicate.or(base.$is("Join"), base.$is("Leave")),
	isMedia: Predicate.or(base.$is("MediaStream"), base.$is("MediaStreamTrack"))
})

const makePeerEventStream = (room: Room) =>
	Effect.gen(function*() {
		const queue = yield* Queue.unbounded<PeerEvent>()
		room.onPeerJoin((peerId) => Queue.offerUnsafe(queue, PeerEvent.Join({ peerId })))
		room.onPeerLeave((peerId) => Queue.offerUnsafe(queue, PeerEvent.Leave({ peerId })))
		room.onPeerStream((stream, peerId, metadata) =>
			Queue.offerUnsafe(queue, PeerEvent.MediaStream({ peerId, stream, metadata }))
		)
		room.onPeerTrack((track, stream, peerId, metadata) =>
			Queue.offerUnsafe(queue, PeerEvent.MediaStreamTrack({ peerId, track, stream, metadata }))
		)
		return Stream.fromQueue(queue)
	})
// const makeRoomAction = <R extends DataPayload>(room: Room, action: string) => room.makeAction<R>(action)

type Peer = {
	id: string // peerId
	connection: RTCPeerConnection // from getPeers()[id]
	streams: HashMap.HashMap<string, { // keyed by stream.id or metadata
		stream: MediaStream
		metadata?: JsonValue
	}>
	tracks: HashMap.HashMap<string, { // keyed by track.id or metadata
		track: MediaStreamTrack
		stream: MediaStream // which stream it belongs to
		metadata?: JsonValue
	}>
}

class TrysteroJoinRoomError extends Data.TaggedError("TrysteroJoinRoomError")<{
	readonly message: string
	readonly cause: unknown
}> {}
export class TrysteroRoom extends Context.Service<TrysteroRoom>()(
	"TrysteroRoom",
	{
		make: Effect.fn(function*(options: {
			args: Parameters<typeof joinRoom>
			actions: {}
		}) {
			const room = yield* Effect.try({
				try: () => joinRoom(...options.args),
				catch: (error) => {
					console.error("Failed to join room", { cause: error })
					throw new TrysteroJoinRoomError({ message: "Failed to join room", cause: error })
				}
			})
			yield* Effect.log("Joined room with ID: " + options.args[1])
			const peerEvents = yield* makePeerEventStream(room)
			const peersRef = yield* Ref.make(new Map<string, Peer>())
			const peersAtom = Atom.make(() => Ref.getUnsafe(peersRef))
			yield* Effect.forkScoped(pipe(
				peerEvents,
				Stream.tap(PeerEvent.$match({
					Join: ({ peerId }) =>
						pipe(
							Ref.update(peersRef, (peers) =>
								peers.set(peerId, {
									id: peerId,
									connection: room.getPeers()[peerId],
									streams: HashMap.empty(),
									tracks: HashMap.empty()
								})),
							Effect.andThen(() => Effect.log(`Peer joined: ${peerId}`))
						),

					Leave: ({ peerId }) =>
						Ref.update(peersRef, (peers) => {
							peers.delete(peerId)
							return peers
						}),
					MediaStream: ({ peerId, stream, metadata }) =>
						Effect.gen(function*() {
							const peers = yield* Ref.get(peersRef)
							const peer = peers.get(peerId)
							if (peer) {
								yield* Ref.update(peersRef, (peers) => {
									return peers.set(peerId, {
										...peer,
										streams: HashMap.set(peer.streams, stream.id, metadata ? { stream, metadata } : { stream })
									})
								})
							}
						}),
					MediaStreamTrack: ({ peerId, track, stream, metadata }) =>
						Effect.gen(function*() {
							const peers = yield* Ref.get(peersRef)
							const peer = peers.get(peerId)
							if (peer) {
								yield* Ref.update(peersRef, (peers) => {
									return peers.set(peerId, {
										...peer,
										tracks: HashMap.set(
											peer.tracks,
											track.id,
											metadata ? { track, stream, metadata } : { track, stream }
										)
									})
								})
							}
						})
				})),
				Stream.tap(() => Atom.refresh(peersAtom)),
				Stream.runDrain
			))
			return {
				room,
				peerEvents,
				peers: Ref.get(peersRef).pipe(Effect.map((peerMap) => Array.from(peerMap.values()))),
				atoms: {
					peers: peersAtom
				}
			}
		}, Effect.provideService(AtomRegistry.AtomRegistry, useContext(RegistryContext)))
	}
) {}

export class Trystero extends Context.Service<Trystero>()(
	"TrysteroManager",
	{
		make: Effect.gen(function*() {
			const currentRoom = yield* Ref.make<typeof TrysteroRoom.Service | null>(null)
			yield* Effect.void
			return {
				joinRoom: Effect.fn(function*(...args: Parameters<typeof joinRoom>) {
					const room = yield* TrysteroRoom.make({ args, actions: {} })
					yield* Ref.set(currentRoom, room)
				}),
				room: Ref.get(currentRoom),
				leaveRoom: Effect.fn(function*() {
					const room = yield* Ref.get(currentRoom)
					if (room) {
						room.room.leave()
						yield* Ref.set(currentRoom, null)
					}
				})
			}
		})
	}
) {}

// namespace host {
// 	// Host generates a room ID and shares it out-of-band (URL, QR code, etc.)
// 	const roomId = crypto.randomUUID()
// 	window.location.hash = roomId // share via URL

// 	const room = joinRoom(config, roomId)

// 	// Define all the actions this game needs
// 	const [sendGameState, getGameState] = room.makeAction("gameState")
// 	const [sendPlayerAction, getPlayerAction] = room.makeAction("playerAction")
// 	const [sendStartGame, getStartGame] = room.makeAction("startGame")

// 	let gameState = { round: 1, scores: {}, board: [] }
// 	let players: Record<string, { ready: boolean }> = {}

// 	// When a new peer joins, send them current state immediately
// 	room.onPeerJoin((peerId) => {
// 		players[peerId] = { ready: false }
// 		sendGameState(gameState, peerId) // target just that peer, not broadcast
// 	})

// 	room.onPeerLeave((peerId) => {
// 		delete players[peerId]
// 		// decide: pause game? end session?
// 	})

// 	// Host receives player inputs and applies them as source of truth
// 	getPlayerAction((action, peerId) => {
// 		gameState = reduce(gameState, action, peerId)
// 		sendGameState(gameState) // broadcast updated state to ALL peers (null = everyone)
// 	})

// 	// Host starts the game
// 	function startGame() {
// 		gameState = initGame(Object.keys(players))
// 		sendStartGame({ startsAt: Date.now() + 3000 })
// 		sendGameState(gameState)
// 	}
// }

// namespace peer {
// 	// Read room ID from URL
// 	const roomId = window.location.hash.slice(1)
// 	const room = joinRoom(config, roomId)

// 	const [sendGameState, getGameState] = room.makeAction("gameState")
// 	const [sendPlayerAction, getPlayerAction] = room.makeAction("playerAction")
// 	const [sendStartGame, getStartGame] = room.makeAction("startGame")

// 	// Receive authoritative state from host and re-render
// 	getGameState((state, fromPeerId) => {
// 		// optionally verify fromPeerId === hostId
// 		render(state)
// 	})

// 	getStartGame(({ startsAt }) => {
// 		scheduleCountdown(startsAt)
// 	})

// 	// Send inputs to host — NOT to all peers
// 	function onPlayerMove(move) {
// 		sendPlayerAction(move, hostId) // target only the host
// 	}
// }

// // The One Gotcha
// // Trystero gives you selfId but not "who joined first". You need to establish host identity yourself — simplest approach is whoever created the room ID owns it, and you communicate hostId via the URL or first message. A common pattern:

// // Embed hostId in the room URL
// const hostId = selfId // from trystero/core utils
// window.location.hash = `${roomId}:${hostId}`

// // Clients parse it. ie;
// window.location.hash.slice(1).split(":")
