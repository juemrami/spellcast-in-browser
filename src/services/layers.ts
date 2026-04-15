import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { Exit, Scope } from "effect"
import { pipe } from "effect/Function"
import { Atom } from "effect/unstable/reactivity"
import * as BoardService from "./BoardService"
import { CurrentWordService } from "./CurrentWordService"
import * as GameStateMachine from "./GameStateMachine"
import { ClientPlayerState } from "./PlayerState"
import { WordList } from "./WordList"

async function createGameSession() {
	const memoMap = Layer.makeMemoMapUnsafe()
	const BoardLayer = Layer.provide(BoardService.live, WordList.layerWordnik)
	const boardAtomRuntime = Atom.context({ memoMap })(BoardLayer)
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
export const currentGameStateMachine = Context.get(gameContext, GameStateMachine.GameStateMachine)
