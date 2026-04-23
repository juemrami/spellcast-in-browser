import { useAtomValue } from "@effect/atom-solid"
import { AsyncResult } from "effect/unstable/reactivity"
import { type Component, For } from "solid-js"
import { boardService } from "../../../../services/layers"
import Tile from "./Tile"

const Board: Component = () => {
	const tiles = useAtomValue(() => boardService.atoms.board)
	return AsyncResult.match(tiles(), {
		onInitial: () => <div>Loading board...</div>,
		onFailure: (e) => {
			console.error("Failed to load board", { cause: e })
			return <div>Failed to load board</div>
		},
		onSuccess: ({ value: boardTiles }) => {
			return (
				<div class="grid grid-cols-5 gap-2.5 sm:gap-3" aria-label="SpellCast board" role="grid">
					<For each={boardTiles}>
						{(tile) => <Tile tile={tile} />}
					</For>
				</div>
			)
		}
	})
}

export default Board
