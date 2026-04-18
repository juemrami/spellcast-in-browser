import { useAtomValue } from "@effect/atom-solid"
import { type Component, For } from "solid-js"
import { boardService } from "../../../services/layers"
import Tile from "./Tile"

const Board: Component = () => {
	const tiles = useAtomValue(() => boardService.boardTiles)

	return (
		<div class="grid grid-cols-5 gap-2.5 sm:gap-3" aria-label="SpellCast board" role="grid">
			<For each={tiles()}>
				{(tile) => <Tile tile={tile} />}
			</For>
		</div>
	)
}

export default Board
