import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/unstable/reactivity/Atom"

export class CurrentWordService extends Context.Service<CurrentWordService, {
	readonly word: Atom.Atom<string>
	readonly displayWord: Atom.Atom<string>
}>()("spellcast/CurrentWordService") {}

export const currentWordLayer = Layer.effect(
	CurrentWordService,
	Effect.sync(() => {
		const word = Atom.make("")
		const displayWord = Atom.make((get) => {
			const value = get(word).trim().toUpperCase()
			return value.length === 0 ? "Trace a word" : value
		})

		return CurrentWordService.of({
			word,
			displayWord
		})
	})
)
