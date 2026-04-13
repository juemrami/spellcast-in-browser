import { Context, Effect, Layer } from "effect"
import type { Board, Path, Tile } from "../types/game"
import { type TrieNode, UnigramTrie } from "./Trie"
import { WordList } from "./WordList"

const getTileNeighbors = (tile: Tile, board: Board): Array<Tile> => {
	const neighbors: Array<Tile> = []
	for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
		for (let colOffset = -1; colOffset <= 1; colOffset++) {
			if (rowOffset === 0 && colOffset === 0) continue
			const potentialNeighbor = board.find((t) => t.row === tile.row + rowOffset && t.col === tile.col + colOffset)
			if (potentialNeighbor) {
				neighbors.push(potentialNeighbor)
			}
		}
	}
	return neighbors
}
const dfs = (
	board: Board,
	tile: Tile,
	trie: TrieNode,
	path: Array<Tile>,
	visited: Map<string, boolean>,
	results: Array<Array<Tile>>
) => {
	const trieNode = trie.children.get(tile.letter.toLowerCase())
	if (!trieNode) return // prune if no words start with the current path
	visited.set(`${tile.row},${tile.col}`, true)
	path.push(tile)
	if (trieNode.isEndOfWord) results.push(path)
	const neighbors = getTileNeighbors(tile, board)
	for (const neighbor of neighbors) {
		if (!visited.get(`${neighbor.row},${neighbor.col}`)) {
			// note: make sure `path` is not a reference to the same array in different recursive calls
			dfs(board, neighbor, trieNode!, [...path], visited, results)
		}
	}
	visited.set(`${tile.row},${tile.col}`, false) // backtrack -- same tile can be used in different paths
}
type BoggleSolutions = {
	paths: Array<Path>
	words: Set<string>
}
export class BoggleSolver extends Context.Service<BoggleSolver>()(
	"BoggleSolver",
	{
		make: Effect.gen(function*() {
			const wordList = yield* WordList
			const trie = yield* UnigramTrie.make(wordList)
			return {
				solve: Effect.fn(function*(board: Board) {
					const results: Array<Path> = []
					const visited = new Map<string, boolean>()
					for (const tile of board) {
						dfs(board, tile, trie.root, [], visited, results)
					}
					return {
						paths: results,
						words: new Set(results.map((path) => path.map((tile) => tile.letter).join("")))
					} as BoggleSolutions
				}),
				analyzeSolution: Effect.fn(function*(solution: BoggleSolutions) {
					const avgWordLength = [...solution.words].reduce((sum, word) => sum + word.length, 0) / solution.words.size
					const longestWord = [...solution.words].reduce(
						(longest, word) => word.length > longest.length ? word : longest,
						""
					)
					const totalWords = solution.words.size
					return {
						avgWordLength,
						longestWord,
						totalWords
					}
				})
			}
		})
	}
) {
	static layer = Layer.effect(this, this.make)
}
