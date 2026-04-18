import { useAtom, useAtomValue } from "@effect/atom-solid"
import { AsyncResult } from "effect/unstable/reactivity"
import { type Component, createEffect } from "solid-js"
import { currentWordService, playerState } from "../../../services/layers"
const SubmitButton: Component = () => {
	const isPlayerTurn = useAtomValue(() => playerState.isPlayerTurn)
	const isCurrentWordValid = useAtomValue(() => currentWordService.isCurrentWordValid)
	const [, clearSelectionPath] = useAtom(() => playerState.clearSelectionPath)
	const [submitResult, submitCurrentWord] = useAtom(() => playerState.submitSelectionPath)
	createEffect(() => {
		AsyncResult.match(submitResult(), {
			"onSuccess": ({ waiting, value: isValid }) => {
				if (!waiting && isValid) {
					clearSelectionPath()
				}
			},
			"onFailure": () => {},
			"onInitial": () => {}
		})
	})
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
			}) || AsyncResult.match(submitResult(), {
				onSuccess: ({ waiting }) => waiting,
				onFailure: () => false,
				onInitial: ({ waiting }) => waiting
			}) || !isPlayerTurn()}
			class="inline-flex items-center justify-center rounded-full border border-control-border not-disabled:bg-gradient-to-b from-control-from to-control-to px-5 py-2.5 text-sm font-semibold tracking-[0.22em] text-control-text shadow-button transition disabled:cursor-not-allowed disabled:opacity-70 disabled:bg-gray-300 disabled:shadow-none"
		>
			{isPlayerTurn() ? "Submit Word" : "Not Your Turn"}
		</button>
	)
}

export default SubmitButton
