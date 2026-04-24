import { Context, Effect, Layer, Option } from "effect"
import { Atom } from "effect/unstable/reactivity"
import { GameStateMachine } from "./GameStateMachine"
import { TrysteroRoom } from "./Trystero"

type ActiveSession = {
	readonly room: typeof TrysteroRoom.Service
	readonly lobbyId: string
}

export class P2PSessionManager extends Context.Service<P2PSessionManager>()(
	"SessionManager",
	{
		make: Effect.gen(function*() {
			const machine = yield* GameStateMachine
			const active = Atom.make<Option.Option<ActiveSession>>(Option.none())
			const join = Atom.fn(Effect.fn(function*(lobbyId: string, get: Atom.FnContext) {
				// Leave existing room before joining a new one, todo maybe error instead?
				const existing = get(active)
				if (Option.isSome(existing)) {
					existing.value.room.room.leave()
					yield* GameStateMachine.clearGame()
				}
				const room = yield* TrysteroRoom.make({
					args: [
						{ appId: "bogglecast-v0", password: "123" },
						lobbyId,
						{ onJoinError: () => {} }
					],
					actions: {}
				})
				// Reset the machine to a fresh InLobby state for this session
				yield* GameStateMachine.startGame(lobbyId)
				get.set(active, Option.some({ room, lobbyId }))
			}, Effect.provideService(GameStateMachine, machine)))

			const leave = Atom.fn(Effect.fn(function*(_: void, get: Atom.FnContext) {
				const current = get(active)
				if (Option.isSome(current)) {
					yield* Effect.promise(() => current.value.room.room.leave())
					get.set(active, Option.none())
				}
			}))

			const peers = Atom.make((get) => {
				const session = get(active)
				return Option.map(session, (s) => get(s.room.atoms.peers))
			})
			return { active, join, leave, peers }
		})
	}
) {
	static layer = Layer.effect(this, this.make)
}
