import type { Component } from "solid-js"

import type { Tile, TileType } from "../types/game"

const tileStyles: Record<TileType, string> = {
	normal:
		"border-tile-normal-border bg-gradient-to-br from-tile-normal-from via-tile-normal-via to-tile-normal-to text-tile-normal-text ring-1 ring-inset ring-white/70 hover:from-tile-normal-hover-from hover:via-tile-normal-hover-via hover:to-tile-normal-hover-to",
	gem:
		"border-tile-gem-border bg-gradient-to-br from-tile-gem-from via-tile-gem-via to-tile-gem-to text-tile-gem-text ring-1 ring-inset ring-white/60 hover:from-tile-gem-hover-from hover:via-tile-gem-hover-via hover:to-tile-gem-hover-to",
	multiplier:
		"border-tile-multiplier-border bg-gradient-to-br from-tile-multiplier-from via-tile-multiplier-via to-tile-multiplier-to text-tile-multiplier-text ring-1 ring-inset ring-white/60 hover:from-tile-multiplier-hover-from hover:via-tile-multiplier-hover-via hover:to-tile-multiplier-hover-to"
}

const TileView: Component<{ readonly tile: Tile }> = (props) => (
	<div
		class={`group flex aspect-square select-none items-center justify-center rounded-[0.95rem] border text-[clamp(1.2rem,3.6vw,1.9rem)] font-extrabold uppercase tracking-[0.14em] text-balance shadow-[0_2px_0_color-mix(in_srgb,var(--color-ink)_8%,transparent),0_12px_26px_color-mix(in_srgb,var(--color-ink)_10%,transparent)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_4px_0_color-mix(in_srgb,var(--color-ink)_8%,transparent),0_16px_32px_color-mix(in_srgb,var(--color-ink)_14%,transparent)] ${
			tileStyles[props.tile.type]
		}`}
		aria-label={`Tile ${props.tile.letter} at row ${props.tile.row + 1}, column ${props.tile.col + 1}`}
		data-tile-type={props.tile.type}
		role="gridcell"
	>
		<span class="translate-y-[1px] drop-shadow-[0_1px_0_color-mix(in_srgb,var(--color-paper-50)_70%,transparent)]">
			{props.tile.letter}
		</span>
	</div>
)

export default TileView
