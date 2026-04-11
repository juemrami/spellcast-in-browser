import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import type { Component } from "solid-js"

import { AsyncResult } from "effect/unstable/reactivity"
import { currentWordService, playerGameState } from "../services/layers"

const CurrentWord: Component = () => {
	const word = useAtomValue(() => currentWordService.word)
	const clearPlayerSelection = useAtomSet(() => playerGameState.clearSelectionPath)
	const getCurrentWordScore = useAtomValue(() => currentWordService.currentWordScore)

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
				<div class="flex flex-col items-start gap-0.5">
					<span>{word() !== "" ? word() : "Trace a word"}</span>
					<div class="self-end px-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-label-soft">
						<span class="font-bold text-header text-lg">
							{word() !== ""
								? AsyncResult.match(getCurrentWordScore(), {
									onSuccess: (pts) => (
										<>
											{pts.value} <span class="text-xs text-label-soft">points</span>
										</>
									),
									onInitial: () => <span class="opacity-0">Points: 0</span>,
									onFailure: () => <span class="opacity-0">Points: 0</span>
								})
								: <span class="opacity-0">Points: 0</span>}
						</span>
					</div>
				</div>
			</div>
		</section>
	)
}

export default CurrentWord
