import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { pipe } from "effect/Function"
import { FetchHttpClient } from "effect/unstable/http"
import * as BoardService from "./BoardService"
import { BoggleSolver } from "./BoggleSolver"
import { currentWordLayer, CurrentWordService } from "./CurrentWordService"
import * as GameState from "./GameState"
import { ClientPlayerState } from "./PlayerState"
import { WordList } from "./WordList"

export const gameLayer = pipe(
	Layer.provideMerge(
		currentWordLayer,
		Layer.mergeAll(
			Layer.provideMerge(
				Layer.provide(BoardService.live, BoggleSolver.layer),
				Layer.provide(WordList.layerWordnik, FetchHttpClient.layer)
			),
			Layer.provideMerge(
				ClientPlayerState.layerFresh,
				GameState.layerFresh
			)
		)
	)
)

const gameContext = await Effect.runPromise(Effect.scoped(Layer.build(gameLayer)))

export const boardService = Context.get(gameContext, BoardService.BoardService)
export const currentWordService = Context.get(gameContext, CurrentWordService)
export const playerState = Context.get(gameContext, ClientPlayerState)
export const gameState = Context.get(gameContext, GameState.GameState)
