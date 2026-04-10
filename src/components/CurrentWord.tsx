import { useAtomValue } from "@effect/atom-solid"
import { type Component, Show } from "solid-js"

import { currentWordService } from "../services/layers"

const CurrentWord: Component = () => {
	const displayWord = useAtomValue(() => currentWordService.displayWord)

	return (
		<section class="rounded-[1.5rem] border border-shell bg-gradient-to-b from-paper-50 to-paper-100 px-5 py-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-paper-50)_70%,transparent),0_8px_20px_color-mix(in_srgb,var(--color-ink)_8%,transparent)]">
			<div class="text-[0.68rem] font-semibold uppercase tracking-[0.45em] text-label-soft">
				Current Word
			</div>
			<div class="mt-3 min-h-14 text-3xl font-black tracking-[0.22em] text-header sm:text-[2.25rem]">
				<Show
					when={displayWord() !== "Trace a word"}
					fallback={<span class="tracking-[0.18em] text-ink-soft">Trace a word</span>}
				>
					<span>{displayWord()}</span>
				</Show>
			</div>
		</section>
	)
}

export default CurrentWord
