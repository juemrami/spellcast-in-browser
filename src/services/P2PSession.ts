// oxlint-disable no-console
import { Context, Data, Effect, Exit, Layer, Option, pipe, Ref, Scope } from "effect"
import { Atom } from "effect/unstable/reactivity"
import { selfId } from "trystero"
import { TrysteroRoom } from "./Trystero"

type ActiveConnection = {
	/** The backing TrysteroRoom service */
	readonly room: typeof TrysteroRoom.Service
	/** Current lobby ID */
	readonly lobbyId: string
	/** Scope tied to connection's room's peer event stream watcher */
	readonly scope: Scope.Scope
	/** Leaves the current room */
	readonly leave: Effect.Effect<void>
}

class ActiveRoomSessionExits extends Data.TaggedError("ActiveP2PRoomConnectionExits")<{
	readonly message: string
	readonly connection: ActiveConnection
}> {}

export class P2PSessionManager extends Context.Service<P2PSessionManager>()(
	"SessionManager",
	{
		make: Effect.gen(function*() {
			const activeRef = yield* Ref.make(Option.none<ActiveConnection>())
			const makeTrysteroRoomConnection = Effect.fn(function*(lobbyId: string, failOnExisting?: boolean) {
				const current = pipe(yield* Ref.get(activeRef), Option.getOrUndefined)
				if (current) {
					if (failOnExisting) {
						return yield* new ActiveRoomSessionExits({
							message: "Cannot join room: active session already exists for room " + current.lobbyId,
							connection: current
						})
					}
					yield* current.leave
				}
				const scope = yield* Scope.make()
				const connection = yield* TrysteroRoom.make({
					args: [
						{ appId: "bogglecast-v0" },
						lobbyId,
						{
							onPeerHandshake: async (id, _, __, isInitiator) => {
								console.log("Peer handshake", { id, isInitiator })
							},
							onJoinError: (err) => {
								console.error("Failed to join room", err)
							}
						}
					],
					actions: {}
				}).pipe(Scope.provide(scope))

				const leave = Effect.gen(function*() {
					yield* Scope.close(scope, Exit.void)
					yield* Effect.promise(() => connection.room.leave())
					yield* Ref.set(activeRef, Option.none())
				})

				yield* Ref.set(activeRef, Option.some({ room: connection, lobbyId, scope, leave }))

				return { room: connection, lobbyId, scope, leave }
			})

			const activeAtom = Atom.make<Option.Option<ActiveConnection>>(() => Ref.getUnsafe(activeRef))
			const joinAtom = Atom.fn(
				Effect.fn(function*(lobbyId: string, get: Atom.FnContext) {
					yield* makeTrysteroRoomConnection(lobbyId)
					get.refresh(activeAtom)
				})
			)
			const leaveAtom = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
				const current = get(activeAtom)
				if (Option.isSome(current)) {
					yield* current.value.leave
				}
				get.refresh(activeAtom)
			}))
			const peersAtom = Atom.make((get) => {
				const session = get(activeAtom)
				return Option.map(session, (s) => get(s.room.atoms.peers))
			})
			return {
				userPeerId: selfId,
				atoms: {
					active: activeAtom,
					join: joinAtom,
					leave: leaveAtom,
					peers: peersAtom
				}
			}
		})
	}
) {
	static layer = Layer.effect(this, this.make)
}
