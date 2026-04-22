import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import type { Component } from "solid-js"

import { AsyncResult } from "effect/unstable/reactivity"
import { clientPlayer } from "../../../services/layers"

const CurrentWord: Component = () => {
	const word = useAtomValue(() => clientPlayer.atoms.selection.word)
	const clearPlayerSelection = useAtomSet(() => clientPlayer.atoms.selection.clear)
	const getCurrentWordScore = useAtomValue(() => clientPlayer.atoms.selection.score)
	const isCurrentWordValid = useAtomValue(() => clientPlayer.atoms.selection.isValid)
	const scorePlaceholder = (
		<span class="font-bold text-lg text-zinc-300 opacity-0">
			0 <span class="text-xs text-zinc-300">points</span>
		</span>
	)
	const isEmptyWord = () => word() === ""
	return (
		<section class="rounded-[1.5rem] border border-shell bg-gradient-to-b from-paper-50 to-paper-100 px-5 py-4 shadow-card">
			<div class="flex items-center justify-between">
				<div class="text-[0.68rem] font-semibold uppercase tracking-[0.45em] text-label-soft">
					Current Word
				</div>
				<button
					type="button"
					disabled={isEmptyWord()}
					onClick={() => {
						clearPlayerSelection()
					}}
					class="inline-flex items-center justify-center rounded-full border border-control-border bg-gradient-to-b from-control-from to-control-to px-3 py-1.5 text-xs font-semibold tracking-[0.22em] text-control-text shadow-button transition hover:opacity-90 active:opacity-80 disabled:opacity-0 disabled:pointer-events-none"
				>
					Clear
				</button>
			</div>
			<div class="mt-3 min-h-14 text-3xl font-black tracking-[0.22em] text-header sm:text-[2.25rem]">
				<div class="flex flex-col items-start gap-0.5">
					<span>{!isEmptyWord() ? word().toUpperCase() : "Trace a word"}</span>
					<div class="self-end px-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-label-soft">
						{isEmptyWord()
							? scorePlaceholder
							: AsyncResult.match(getCurrentWordScore(), {
								onSuccess: (pts) =>
									AsyncResult.match(isCurrentWordValid(), {
										onSuccess: (r) => (
											<span class={`font-bold text-lg ${r.value ? "text-header" : "text-zinc-300"}`}>
												{pts.value} <span class={`text-xs ${r.value ? "text-header" : "text-zinc-300"}`}>points</span>
											</span>
										),
										onFailure: () => scorePlaceholder,
										onInitial: () => scorePlaceholder
									}),
								onInitial: () => scorePlaceholder,
								onFailure: () => scorePlaceholder
							})}
					</div>
				</div>
			</div>
		</section>
	)
}

export default CurrentWord
