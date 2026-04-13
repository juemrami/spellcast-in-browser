import { useAtomSet } from "@effect/atom-solid"
import type { Component } from "solid-js"

import { boardService, playerGameState } from "../services/layers"

const DeveloperPanel: Component = () => {
	const regenerateBoard = useAtomSet(() => boardService.regenerateBoard)
	const clearSelectionPath = useAtomSet(() => playerGameState.clearSelectionPath)

	const handleRegenerate = () => {
		clearSelectionPath()
		regenerateBoard()
	}

	return (
		<aside
			id="developer-panel"
			class="w-full max-w-[14rem] max-h-[calc(100vh-5rem)] overflow-auto rounded-xl border border-shell bg-paper-50/90 p-3 shadow-[0_12px_28px_color-mix(in_srgb,var(--color-ink)_10%,transparent)] backdrop-blur"
		>
			<div class="flex items-center justify-between gap-3">
				<p class="text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-label-soft">
					Developer Panel
				</p>
			</div>

			<button
				type="button"
				onClick={handleRegenerate}
				class="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-shell bg-paper-100 px-3 py-1.5 text-xs font-semibold tracking-[0.12em] text-ink transition hover:bg-paper-200 active:bg-paper-200"
			>
				Regenerate board
			</button>
		</aside>
	)
}

export default DeveloperPanel
