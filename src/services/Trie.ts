import { Context, Effect } from "effect"

export type TrieNode = {
	children: Map<string, TrieNode>
	isEndOfWord: boolean
}
export class UnigramTrie extends Context.Service<UnigramTrie>()(
	"UnigramTrie",
	{
		make: Effect.fn(function*(wordList: Array<string>) {
			const root = {
				children: new Map(),
				isEndOfWord: false
			} as TrieNode

			for (const word of wordList) {
				let currentNode = root
				for (const letter of word) {
					if (!currentNode.children.has(letter)) {
						currentNode.children.set(letter, { children: new Map(), isEndOfWord: false } as TrieNode)
					}
					currentNode = currentNode.children.get(letter)!
				}
				currentNode.isEndOfWord = true
			}

			return {
				root
			}
		})
	}
) {}
