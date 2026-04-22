import type { Component } from "solid-js"

import { useAtomSet, useAtomValue } from "@effect/atom-solid/Hooks"
import { pipe } from "effect"
import { Atom } from "effect/unstable/reactivity"
import { boardService, clientPlayer } from "../../../services/layers"
import type { Tile, TileType } from "../../../types/game"

const baseStyles: Record<TileType, string> = {
	normal:
		"border-tile-normal-border bg-gradient-to-br from-tile-normal-from via-tile-normal-via to-tile-normal-to text-tile-normal-text ring-1 ring-inset ring-white/70 hover:from-tile-normal-hover-from hover:via-tile-normal-hover-via hover:to-tile-normal-hover-to",
	gem:
		"border-tile-gem-border bg-gradient-to-br from-tile-gem-from via-tile-gem-via to-tile-gem-to text-tile-gem-text ring-1 ring-inset ring-white/60 hover:from-tile-gem-hover-from hover:via-tile-gem-hover-via hover:to-tile-gem-hover-to",
	multiplier:
		"border-tile-multiplier-border bg-gradient-to-br from-tile-multiplier-from via-tile-multiplier-via to-tile-multiplier-to text-tile-multiplier-text ring-1 ring-inset ring-white/60 hover:from-tile-multiplier-hover-from hover:via-tile-multiplier-hover-via hover:to-tile-multiplier-hover-to"
}

const getTileStyles = (type: TileType, selected: boolean): string => {
	if (selected) {
		return "selected-tile ring-2 ring-offset-2 scale-105 -translate-y-0.5"
	}
	return baseStyles[type]
}

const getScoreChipStyles = (_score: number): string => {
	return "text-ink"
}

const TileView: Component<{ readonly tile: Tile }> = (props) => {
	const trySelectTile = useAtomSet(() => clientPlayer.atoms.selection.tryUpdate)
	const clearSelectionPath = useAtomSet(() => clientPlayer.atoms.selection.clear)
	const isMouseDown = useAtomValue(() => clientPlayer.atoms.isMouseDown)
	const tileScore = boardService.getTileScore(props.tile)
	const isTileSelected = useAtomValue(() =>
		pipe(
			clientPlayer.atoms.selection.path,
			Atom.transform((get) => {
				const path = get(clientPlayer.atoms.selection.path)
				return path.some((t) => t.row === props.tile.row && t.col === props.tile.col)
			})
		)
	)
	const isHeadOfPath = useAtomValue(() =>
		pipe(
			clientPlayer.atoms.selection.path,
			Atom.transform((get) => {
				const path = get(clientPlayer.atoms.selection.path)
				return path.length > 0 && path[0]?.row === props.tile.row && path[0]?.col === props.tile.col
			})
		)
	)
	const debouncedTileSelect = useAtomSet(() =>
		pipe(
			clientPlayer.atoms.selection.tryUpdate,
			Atom.debounce("20 millis")
		)
	)
	return (
		<div
			class={`group relative flex aspect-square select-none items-center justify-center rounded-[0.95rem] border text-[clamp(1.2rem,3.6vw,1.9rem)] font-extrabold uppercase tracking-[0.14em] text-balance shadow-tile transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-tile-hover ${
				getTileStyles(
					props.tile.type,
					isTileSelected()
				)
			}`}
			aria-label={`Tile ${props.tile.letter} at row ${props.tile.row + 1}, column ${props.tile.col + 1}`}
			aria-pressed={isTileSelected()}
			data-tile-type={props.tile.type}
			role="gridcell"
			onMouseDown={(e) => e.button !== 2 && trySelectTile(props.tile)}
			onMouseEnter={() => {
				if (isMouseDown()) debouncedTileSelect(props.tile)
			}}
			onContextMenu={(e) => {
				if (isHeadOfPath()) {
					e.preventDefault()
					clearSelectionPath()
				}
			}}
		>
			<span
				aria-hidden="true"
				class={`pointer-events-none absolute right-1 top-1 inline-flex min-w-6 items-center justify-center rounded-full border border-white/70 bg-paper-50/90 px-2 py-0.5 text-[0.72rem] font-extrabold leading-none tracking-[0.08em] shadow-chip ${
					getScoreChipStyles(tileScore)
				}`}
			>
				{tileScore}
			</span>
			<span class="translate-y-[1px] drop-shadow-frost">
				{props.tile.letter}
			</span>
		</div>
	)
}

export default TileView
