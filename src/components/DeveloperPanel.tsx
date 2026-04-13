import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { AsyncResult } from "effect/unstable/reactivity"
import { type Component, For } from "solid-js"
import { boardService, playerGameState } from "../services/layers"

const DeveloperPanel: Component = () => {
	const regenerateBoard = useAtomSet(() => boardService.regenerateBoard)
	const clearSelectionPath = useAtomSet(() => playerGameState.clearSelectionPath)
	const solutions = useAtomValue(() => boardService.boardSolutions)

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

			<div class="mt-3 rounded-lg border border-shell bg-paper-100/80 px-3 py-2">
				{AsyncResult.match(solutions(), {
					onSuccess: (solution) => {
						const words = [...solution.value.words].sort((firstWord, secondWord) => firstWord.localeCompare(secondWord))
						return (
							<div class="space-y-2">
								<div class="flex items-center justify-between gap-3 text-[0.65rem] uppercase tracking-[0.2em] text-label-soft">
									<span>Solver words</span>
									<span class="text-ink">{words.length}</span>
								</div>
								{words.length > 0
									? (
										<ul class="max-h-40 space-y-1 overflow-auto text-[0.72rem] leading-5 text-ink">
											<For each={words}>
												{(word) => (
													<li class="rounded-md bg-paper-50 px-2 py-1 font-medium tracking-[0.08em]">
														{word}
													</li>
												)}
											</For>
										</ul>
									)
									: <p class="text-[0.72rem] leading-5 text-label-muted">No words found.</p>}
							</div>
						)
					},
					onInitial: () => <p class="text-[0.72rem] leading-5 text-label-muted">Solving board...</p>,
					onFailure: () => <p class="text-[0.72rem] leading-5 text-label-muted">Solver unavailable.</p>
				})}
			</div>
		</aside>
	)
}

export default DeveloperPanel
