import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { boardLayer, BoardService } from "./BoardService"
import { currentWordLayer, CurrentWordService } from "./CurrentWordService"

export const gameLayer = Layer.mergeAll(boardLayer, currentWordLayer)

const gameContext = Effect.runSync(Effect.scoped(Layer.build(gameLayer)))

export const boardService = Context.get(gameContext, BoardService)
export const currentWordService = Context.get(gameContext, CurrentWordService)
