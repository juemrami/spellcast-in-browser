import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { RegistryContext } from "@effect/atom-solid"
import { layerLocalStorage } from "@effect/platform-browser/BrowserKeyValueStore"
import { Exit, Scope } from "effect"
import { pipe } from "effect/Function"
import { Atom, AtomRegistry } from "effect/unstable/reactivity"
import { useContext } from "solid-js"
import * as BoardService from "./BoardService"
import * as GameStateMachine from "./GameStateMachine"
import { PlayerCurrentWordAtoms } from "./PlayerCurrentWordAtoms"
import { ClientPlayerState } from "./PlayerState"
import { WordList } from "./WordList"

const scope = Scope.makeUnsafe()
const createGameSession = Effect.gen(function*() {
	const memoMap = Layer.makeMemoMapUnsafe()

	const BoardLayer = Layer.provide(BoardService.live, WordList.layerWordnik)
	const BrowserKvsLayer = layerLocalStorage
	const atomRuntime = Atom.context({ memoMap })(Layer.mergeAll(BoardLayer, BrowserKvsLayer))
	const AtomRuntimeLayer = yield* Atom.get(atomRuntime.layer)

	const makeStateMachine = pipe(
		GameStateMachine.make(atomRuntime),
		Effect.provideService(Scope.Scope, scope)
	)
	const GameHostLayer = Layer.effect(GameStateMachine.GameStateMachine, makeStateMachine)
	const GameLayer = pipe(
		PlayerCurrentWordAtoms.layer,
		Layer.provideMerge(ClientPlayerState.layerFresh),
		Layer.provideMerge(GameHostLayer),
		Layer.provideMerge(AtomRuntimeLayer)
	)
	return {
		memoMap: memoMap,
		gameContext: yield* Layer.buildWithMemoMap(GameLayer, memoMap, scope),
		closeGame: () => {
			Scope.close(scope, Exit.succeed(undefined))
		}
	}
}).pipe(
	Effect.provideService(AtomRegistry.AtomRegistry, useContext(RegistryContext))
)

export const { gameContext } = await Effect.runPromise(createGameSession)

export const boardService = Context.get(gameContext, BoardService.BoardService)
export const currentWordService = Context.get(gameContext, PlayerCurrentWordAtoms)
export const playerState = Context.get(gameContext, ClientPlayerState)
export const currentGameStateMachine = Context.get(gameContext, GameStateMachine.GameStateMachine).atom
