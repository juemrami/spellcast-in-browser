import { useAtomValue } from "@effect/atom-solid"
import { Option, pipe, Result } from "effect"
import { createSignal, type ParentComponent, Show } from "solid-js"
import { router } from "../App"
import DeveloperPanel from "./DeveloperPanel"

const GameLayout: ParentComponent = (props: { children?: any }) => {
	// const tileCount = useAtomValue(() => boardService.atoms.tileCount)
	const currentPath = useAtomValue(() => router.pathname)
	const [isDeveloperPanelOpen, setDeveloperPanelOpen] = createSignal(false)
	const isHome = () =>
		pipe(
			currentPath(),
			Result.getSuccess,
			Option.map((path) => path === "/" || path === "/home"),
			Option.getOrElse(() => false)
		)
	return (
		<main class="relative min-h-screen overflow-hidden px-2 py-8 text-ink sm:px-4 lg:px-6">
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
				<header
					class={`flex w-full max-w-[32rem] flex-col items-center gap-4 text-center ${
						!isHome() ? "mt-0" : "not-md:mt-[40%]"
					}`}
				>
					<p class="text-3xl font-semibold uppercase tracking-[0.55em] text-label">
						BoggleCast
					</p>
					{
						/* <div class="inline-flex items-center gap-2 rounded-full border border-shell bg-paper-50/82 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-badge shadow-pill backdrop-blur">
						<span>{tileCount()}</span>
						<span class="text-label-muted">letters</span>
						<span class="text-label-faint">•</span>
						<span>puzzle</span>
					</div> */
					}
				</header>
				{props.children}
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
