import { useAtomValue } from "@effect/atom-solid"
import { type Component, createSignal, Show } from "solid-js"

import { boardService } from "../services/layers"
import Board from "./Board"
import CurrentWord from "./CurrentWord"
import DeveloperPanel from "./DeveloperPanel"
import SubmitButton from "./SubmitButton"
import { Switch } from "./ui/switch"

const GameLayout: Component = () => {
	const tileCount = useAtomValue(() => boardService.tileCount)
	const [isDeveloperPanelOpen, setDeveloperPanelOpen] = createSignal(false)

	return (
		<main class="relative min-h-screen overflow-hidden px-4 py-8 text-ink sm:px-6 lg:px-8">
			<div class="absolute inset-x-0 top-0 -z-10 mx-auto h-[28rem] w-[52rem] max-w-full rounded-full bg-glow-rose/44 blur-3xl" />
			<div class="absolute left-[-8rem] top-32 -z-10 h-80 w-80 rounded-full bg-glow-mint/70 blur-3xl" />
			<div class="absolute right-[-6rem] bottom-0 -z-10 h-72 w-72 rounded-full bg-glow-sun/55 blur-3xl" />

			<div class="fixed right-4 top-4 z-50">
				<button
					type="button"
					aria-controls="developer-panel"
					aria-expanded={isDeveloperPanelOpen()}
					onClick={() => {
						setDeveloperPanelOpen((open) => !open)
					}}
					class="inline-flex items-center gap-2 rounded-full border border-shell bg-paper-50/90 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-badge shadow-[0_8px_20px_color-mix(in_srgb,var(--color-ink)_12%,transparent)] backdrop-blur transition hover:-translate-y-0.5"
				>
					<span class="h-2 w-2 rounded-full bg-glow-mint" />
					{isDeveloperPanelOpen() ? "Hide dev panel" : "Show dev panel"}
				</button>
			</div>

			<div class="mx-auto flex w-full max-w-5xl flex-col items-center gap-7">
				<header class="flex w-full max-w-[32rem] flex-col items-center gap-4 text-center">
					<p class="text-3xl font-semibold uppercase tracking-[0.55em] text-label">
						BoggleCast
					</p>
					<div class="inline-flex items-center gap-2 rounded-full border border-shell bg-paper-50/82 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-badge shadow-[0_8px_18px_color-mix(in_srgb,var(--color-ink)_8%,transparent)] backdrop-blur">
						<span>{tileCount()}</span>
						<span class="text-label-muted">letters</span>
						<span class="text-label-faint">•</span>
						<span>puzzle</span>
					</div>
				</header>

				<section class="w-full max-w-[31.5rem] rounded-[2rem] border border-shell bg-gradient-to-b from-paper-50 to-paper-100 p-4 shadow-[0_28px_80px_color-mix(in_srgb,var(--color-ink)_14%,transparent)] sm:p-6">
					<div class="mb-2 flex w-full items-center justify-end gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-badge">
						<span class="text-label-muted">auto-submit</span>
						<Switch ariaLabel="Auto-submit" class="shrink-0" onChange={(value) => {}} />
					</div>
					<CurrentWord />
					<div class="mt-4">
						<Board />
					</div>
					<div class="mt-6 flex justify-center">
						<SubmitButton />
					</div>
				</section>
			</div>

			<Show when={isDeveloperPanelOpen()}>
				<div class="fixed right-4 top-16 z-50 w-[min(18rem,calc(100vw-2rem))]">
					<DeveloperPanel />
				</div>
			</Show>
		</main>
	)
}

export default GameLayout
