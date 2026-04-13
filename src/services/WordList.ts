import { Context, Effect, Layer, Random } from "effect"
import { HttpClient } from "effect/unstable/http"
import wordnikWordListUrl from "../wordlists/wordnik.txt?url"

const ENGLISH_ALPHABET = [
	"A",
	"B",
	"C",
	"D",
	"E",
	"F",
	"G",
	"H",
	"I",
	"J",
	"K",
	"L",
	"M",
	"N",
	"O",
	"P",
	"Q",
	"R",
	"S",
	"T",
	"U",
	"V",
	"W",
	"X",
	"Y",
	"Z"
] as const

export class WordList extends Context.Service<WordList>()(
	"WordList",
	{
		make: Effect.fn(function*(wordListUrl: string) {
			const httpClient = yield* HttpClient.HttpClient
			const response = yield* httpClient.get(wordListUrl)
			const wordListTxt = yield* response.text
			const wordList = wordListTxt.split("\n").map((word) => word.trim()).filter((word) => word.length > 0).map((w) =>
				w.replace(/[^a-zA-Z]/g, "")
			)
			return wordList
		})
	}
) {
	static layerWordnik = Layer.effect(this, this.make(wordnikWordListUrl))
}

export class LetterFrequencyAnalyzer extends Context.Service<LetterFrequencyAnalyzer>()("LetterFrequencyAnalyzer", {
	make: Effect.gen(function*() {
		const wordList = yield* WordList
		const letterFrequency: Record<string, number> = {}
		for (const word of wordList) {
			if (word.length < 4) continue // skip short words
			for (const letter of word) {
				letterFrequency[letter] = (letterFrequency[letter] || 0) + 1
			}
		}
		const normalizedLetterFrequencies: Record<string, number> = yield* Effect.gen(function*() {
			const totalLetters = Object.values(letterFrequency).reduce((sum, count) => sum + count, 0)
			const normalized: Record<string, number> = {}
			for (const letter in letterFrequency) {
				normalized[letter] = Math.floor((letterFrequency[letter] / totalLetters) * 100)
			}
			return normalized
		})
		const distributedAlphabet = ENGLISH_ALPHABET.map((letter) =>
			Array(normalizedLetterFrequencies[letter.toLowerCase()] || 0).fill(letter as string)
		).flat()
		return {
			frequencies: {
				unigram: letterFrequency
			},

			sample: Effect.fn(function*(n: number, options: {
				maxOccurrencesPerLetter?: number
			} = {}) {
				const result: Array<string> = []
				const occurrences: Record<string, number> = {}
				for (let i = 0; i < n; i++) {
					const index = yield* Random.nextIntBetween(0, distributedAlphabet.length - 1)
					const letter = distributedAlphabet[index]
					if (options.maxOccurrencesPerLetter !== undefined) {
						const currentOccurrences = occurrences[letter] || 0
						if (currentOccurrences >= options.maxOccurrencesPerLetter) {
							i--
							continue
						}
						occurrences[letter] = currentOccurrences + 1
					}
					result.push(letter)
				}
				return result
			})
		}
	})
}) {
	static layer = Layer.effect(LetterFrequencyAnalyzer, LetterFrequencyAnalyzer.make)
}
