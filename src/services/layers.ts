import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { RegistryContext } from "@effect/atom-solid"
import { Exit, Scope } from "effect"
import { pipe } from "effect/Function"
import { Atom, AtomRegistry } from "effect/unstable/reactivity"
import { useContext } from "solid-js"
import * as BoardService from "./BoardService"
import { CurrentWordService } from "./CurrentWordService"
import * as GameStateMachine from "./GameStateMachine"
import { ClientPlayerState } from "./PlayerState"
import { WordList } from "./WordList"

async function createGameSession() {
	const memoMap = Layer.makeMemoMapUnsafe()
	const AtomRegistryLayer = Layer.effect(
		AtomRegistry.AtomRegistry,
		Effect.succeed(useContext(RegistryContext))
	)
	const BoardLayer = Layer.provide(BoardService.live, WordList.layerWordnik)
	const boardAtomRuntime = Atom.context({ memoMap })(
		Layer.mergeAll(BoardLayer, AtomRegistryLayer)
	)
	const HostLayer = Layer.effect(
		GameStateMachine.GameStateMachine,
		GameStateMachine.make(boardAtomRuntime)
	)

	const GameLayer = pipe(
		Layer.provideMerge(CurrentWordService.layer, BoardLayer),
		Layer.provideMerge(ClientPlayerState.layerFresh),
		Layer.provideMerge(HostLayer)
	)
	const scope = Scope.makeUnsafe()
	return {
		memoMap: memoMap,
		gameContext: await Effect.runPromise(Effect.gen(function*() {
			return yield* Layer.buildWithMemoMap(GameLayer, memoMap, scope)
		})),
		closeGame: () => {
			Scope.close(scope, Exit.succeed(undefined))
		}
	}
}

export const { gameContext } = await createGameSession()

export const boardService = Context.get(gameContext, BoardService.BoardService)
export const currentWordService = Context.get(gameContext, CurrentWordService)
export const playerState = Context.get(gameContext, ClientPlayerState)
export const currentGameStateMachine = Context.get(gameContext, GameStateMachine.GameStateMachine).atom
