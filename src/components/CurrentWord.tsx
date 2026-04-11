import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { type Component, Show } from "solid-js"

import { currentWordService, playerGameState } from "../services/layers"

const CurrentWord: Component = () => {
	const word = useAtomValue(() => currentWordService.word)
	const clearPlayerSelection = useAtomSet(() => playerGameState.clearSelectionPath)

	return (
		<section class="rounded-[1.5rem] border border-shell bg-gradient-to-b from-paper-50 to-paper-100 px-5 py-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-paper-50)_70%,transparent),0_8px_20px_color-mix(in_srgb,var(--color-ink)_8%,transparent)]">
			<div class="flex items-center justify-between">
				<div class="text-[0.68rem] font-semibold uppercase tracking-[0.45em] text-label-soft">
					Current Word
				</div>
				<button
					type="button"
					disabled={word() === ""}
					onClick={() => {
						clearPlayerSelection()
					}}
					class="inline-flex items-center justify-center rounded-full border border-control-border bg-gradient-to-b from-control-from to-control-to px-3 py-1.5 text-xs font-semibold tracking-[0.22em] text-control-text shadow-[0_8px_0_color-mix(in_srgb,var(--color-ink)_14%,transparent),0_18px_30px_color-mix(in_srgb,var(--color-ink)_12%,transparent)] transition hover:opacity-90 active:opacity-80 disabled:opacity-0 disabled:pointer-events-none"
				>
					Clear
				</button>
			</div>
			<div class="mt-3 min-h-14 text-3xl font-black tracking-[0.22em] text-header sm:text-[2.25rem]">
				<Show
					when={word() !== ""}
					fallback={<span class="tracking-[0.18em] text-ink-soft">Trace a word</span>}
				>
					<span>{word()}</span>
				</Show>
			</div>
		</section>
	)
}

export default CurrentWord
