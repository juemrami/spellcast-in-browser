import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { AsyncResult } from "effect/unstable/reactivity"
import type { Component } from "solid-js"
import { currentWordService, playerState } from "../../../services/layers"

const SubmitButton: Component = () => {
	const isCurrentWordValid = useAtomValue(() => currentWordService.isCurrentWordValid)
	const submitCurrentWord = useAtomSet(() => playerState.submitSelectionPath)
	return (
		<button
			type="button"
			onClick={() => {
				submitCurrentWord()
			}}
			disabled={AsyncResult.match(isCurrentWordValid(), {
				onSuccess: (r) => r.value === false,
				onFailure: () => true,
				onInitial: () => true
			})}
			class="inline-flex items-center justify-center rounded-full border border-control-border not-disabled:bg-gradient-to-b from-control-from to-control-to px-5 py-2.5 text-sm font-semibold tracking-[0.22em] text-control-text shadow-button transition disabled:cursor-not-allowed disabled:opacity-70 disabled:bg-gray-300 disabled:shadow-none"
		>
			Submit Word
		</button>
	)
}

export default SubmitButton
