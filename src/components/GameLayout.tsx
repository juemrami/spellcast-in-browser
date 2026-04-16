import { useAtomValue } from "@effect/atom-solid"
import { Cause, Match, Option, pipe } from "effect"
import { AsyncResult } from "effect/unstable/reactivity"
import { type Component, createSignal, Show } from "solid-js"
import { boardService, currentGameStateMachine } from "../services/layers"
import Board from "./Board"
import CurrentWord from "./CurrentWord"
import DeveloperPanel from "./DeveloperPanel"
import SubmitButton from "./SubmitButton"
import { Switch as UiSwitch } from "./ui/switch"
import Lobby from "./views/Lobby"

const GameLayout: Component = () => {
	const tileCount = useAtomValue(() => boardService.tileCount)
	const [isDeveloperPanelOpen, setDeveloperPanelOpen] = createSignal(false)
	const currentGame = useAtomValue(() => currentGameStateMachine)

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
					class="inline-flex items-center gap-2 rounded-full border border-shell bg-paper-50/90 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-badge shadow-pill backdrop-blur transition hover:-translate-y-0.5"
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
					<div class="inline-flex items-center gap-2 rounded-full border border-shell bg-paper-50/82 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-badge shadow-pill backdrop-blur">
						<span>{tileCount()}</span>
						<span class="text-label-muted">letters</span>
						<span class="text-label-faint">•</span>
						<span>puzzle</span>
					</div>
				</header>
				<section class="w-full max-w-[31.5rem] rounded-[2rem] border border-shell bg-gradient-to-b from-paper-50 to-paper-100 p-4 shadow-panel-hero sm:p-6">
					{AsyncResult.match(currentGame(), {
						onSuccess: ({ value: matchState }) =>
							Match.value(matchState).pipe(
								Match.when({ phase: "lobby" }, (state) => <Lobby players={state.players} />),
								Match.when(
									{ phase: "in-round" },
									() => (
										<>
											<div class="mb-2 flex w-full items-center justify-end gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-badge">
												<span class="text-label-muted">auto-submit</span>
												<UiSwitch ariaLabel="Auto-submit" class="shrink-0" onChange={() => {}} />
											</div>
											<CurrentWord />
											<div class="mt-4">
												<Board />
											</div>
											<div class="mt-6 flex justify-center">
												<SubmitButton />
											</div>
										</>
									)
								),
								Match.when({ phase: "between-rounds" }, () => <></>),
								Match.exhaustive
							),
						onInitial: () => (
							<p class="text-center text-sm font-semibold uppercase tracking-[0.28em] text-label">
								Loading game...
							</p>
						),
						onFailure: ({ cause }) => (
							<p class="text-center text-sm font-semibold uppercase tracking-[0.28em] text-red-500">
								Failed to load game state.
								{Option.getOrUndefined(
									pipe(
										Cause.findErrorOption(cause),
										Option.map((error) => {
											console.error(error)
											return error.toString()
										})
									)
								)}
							</p>
						)
					})}
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
