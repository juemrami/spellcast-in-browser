import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { pipe } from "effect/Function"
import { FetchHttpClient } from "effect/unstable/http"
import * as BoardService from "./BoardService"
import { currentWordLayer, CurrentWordService } from "./CurrentWordService"
import { PlayerGameState } from "./PlayerState"
import { WordList } from "./WordList"

export const gameLayer = pipe(
	Layer.provideMerge(
		currentWordLayer,
		Layer.merge(
			Layer.provideMerge(BoardService.live, Layer.provide(WordList.layerWordnik, FetchHttpClient.layer)),
			PlayerGameState.layerFresh
		)
	)
)

const gameContext = await Effect.runPromise(Effect.scoped(Layer.build(gameLayer)))

export const boardService = Context.get(gameContext, BoardService.BoardService)
export const currentWordService = Context.get(gameContext, CurrentWordService)
export const playerGameState = Context.get(gameContext, PlayerGameState)
