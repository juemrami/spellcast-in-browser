import { Context, Effect, Layer, Random } from "effect"
import { toLowerCase } from "effect/String"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
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
const ENGLISH_ALPHABET_LOWER = ENGLISH_ALPHABET.map(toLowerCase)
export type EnglishLetterLower = typeof ENGLISH_ALPHABET_LOWER[number]

const isEnglishLetter = (s: string): s is typeof ENGLISH_ALPHABET_LOWER[number] =>
	ENGLISH_ALPHABET_LOWER.includes(s as any)

export class WordList extends Context.Service<WordList>()(
	"WordList",
	{
		make: Effect.fn(function*(wordListUrl: string) {
			const httpClient = yield* HttpClient.HttpClient
			const response = yield* httpClient.get(wordListUrl)
			const wordListTxt = yield* response.text
			const wordList = wordListTxt.split("\n")
				.map((word) => word.trim())
				.filter((word) => word.length > 0)
				.map((w) => w.replace(/[^a-zA-Z]/g, "").toLowerCase())
			return wordList
		})
	}
) {
	static layerWordnik = Layer.provide(Layer.effect(this, this.make(wordnikWordListUrl)), FetchHttpClient.layer)
}

export class LetterFrequencyAnalyzer extends Context.Service<LetterFrequencyAnalyzer>()("LetterFrequencyAnalyzer", {
	make: Effect.gen(function*() {
		const wordList = yield* WordList
		type FrequencyRecord = Record<EnglishLetterLower, number>
		const letterFrequency = {} as FrequencyRecord
		for (const word of wordList) {
			// skip short words. short words are more likely to contain same characters, changes distribution
			if (word.length < 4) continue
			const localFreqs: Partial<FrequencyRecord> = {}
			for (const letter of word) {
				if (!isEnglishLetter(letter)) continue // skip words with non english characters
				localFreqs[letter] = (localFreqs[letter] || 0) + 1
			}
			for (const letter of (word as unknown as Array<EnglishLetterLower>)) {
				letterFrequency[letter] = (letterFrequency[letter] || 0) + localFreqs[letter]!
			}
		}
		for (const letter of ENGLISH_ALPHABET_LOWER) {
			if (!letterFrequency[letter]) {
				letterFrequency[letter] = 0
			}
		}
		const normalizedLetterFrequencies: FrequencyRecord = yield* Effect.gen(function*() {
			const totalLetters = Object.values(letterFrequency).reduce((sum, count) => sum + count, 0)
			const normalized = {} as FrequencyRecord
			Object.entries(letterFrequency).forEach(([letter, count]) => {
				normalized[letter as EnglishLetterLower] = count === 0 ? 0 : Math.floor((count / totalLetters) * 100)
			})
			return normalized
		})
		const distributedAlphabet = ENGLISH_ALPHABET_LOWER.flatMap((letter) =>
			// always include at least 1 of each letter
			Array<EnglishLetterLower>(normalizedLetterFrequencies[letter] || 1).fill(letter)
		)
		return {
			frequencies: {
				unigram: letterFrequency
			},
			/** Returns array of N random letters from the wordlist letters distribution */
			sample: Effect.fn(function*(n: number, options: {
				maxOccurrencesPerLetter?: number
			} = {}) {
				const result: Array<EnglishLetterLower> = []
				const occurrences: Partial<FrequencyRecord> = {}
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
