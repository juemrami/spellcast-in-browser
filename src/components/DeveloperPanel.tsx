// oxlint-disable no-console
import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-solid"
import { Effect, Exit, identity, Match, pipe } from "effect"
import { AtomRegistry } from "effect/unstable/reactivity"
import { type Component, For, useContext } from "solid-js"
import { router } from "../App"
import type { BoggleSolutions } from "../services/BoggleSolver"
import { GameMatchAction, GameMatchState } from "../services/GameStateMachine"
import { boardService, clientPlayer, gameStateMachine } from "../services/layers"

const regenerateBoard = async () => {
	try {
		await Effect.runPromise(
			boardService.regenerateBoard().pipe(
				Effect.provideService(AtomRegistry.AtomRegistry, useContext(RegistryContext))
			)
		)
	} catch (e) {
		console.error("Failed to regenerate board", { cause: e })
	}
}

const solutions = () =>
	pipe(
		Effect.runSyncExit(boardService.boardSolutions),
		Exit.match({
			onSuccess: identity,
			onFailure: (e) => {
				console.error("Failed to get board solutions", { cause: e })
				return {
					words: new Set(),
					paths: []
				} satisfies BoggleSolutions
			}
		})
	)

const DeveloperPanel: Component = () => {
	const clearSelectionPath = useAtomSet(() => clientPlayer.atoms.selection.clear)
	const setRouterPath = useAtomSet(() => router.pathname)
	const goHome = () => setRouterPath({ path: "/", pushHistory: true })
	const [currentGameState, reduceGameState] = [
		useAtomValue(() => gameStateMachine.atoms.state),
		useAtomSet(() => gameStateMachine.atoms.reduce)
	]
	const matchState = () =>
		Match.valueTags(currentGameState(), {
			Active: ({ snapshot }) => snapshot,
			Crashed: (_) => undefined
		})
	const handleRegenerate = () => {
		clearSelectionPath()
		regenerateBoard()
	}
	const words = () => [...(solutions().words)].sort((firstWord, secondWord) => firstWord.localeCompare(secondWord))

	return (
		<aside
			id="developer-panel"
			class="w-full max-w-[14rem] max-h-[calc(100vh-5rem)] overflow-auto rounded-xl border border-shell bg-paper-50/90 p-3 shadow-panel backdrop-blur"
		>
			<div class="flex items-center justify-between gap-3">
				<p class="text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-label-soft">
					Developer Panel
				</p>
				<div class="flex">
					<button
						class="s-4"
						onClick={() => {
							goHome()
						}}
					>
						🏠
					</button>
				</div>
			</div>
			<div class="mt-3 rounded-lg border border-shell bg-paper-100/80 px-3 py-2 text-[0.72rem] leading-5 text-ink">
				<div class="flex items-center justify-between gap-3">
					<span class="uppercase tracking-[0.2em] text-label-soft">Match phase</span>
					<span class="font-semibold">{matchState()?._tag}</span>
				</div>
				<div class="mt-1 flex items-center justify-between gap-3 text-label-muted">
					<span>Players</span>
					<span>{matchState()?.players.length}</span>
				</div>
				{Match.value(matchState()).pipe(
					Match.when(
						GameMatchState.$is("InRound"),
						(state) => (
							<>
								<div class="flex items-center justify-between gap-3 text-label-muted">
									<span>Current Round</span>
									<span>{state.currentRound.id}</span>
								</div>
								<div class="flex items-center justify-between gap-3 text-label-muted">
									<span>Rounds</span>
									<span>{state.rounds.length}</span>
								</div>
							</>
						)
					),
					Match.orElse(() => undefined)
				)}
				<button
					type="button"
					onClick={() => {
						reduceGameState(GameMatchAction.resetMatch())
					}}
					class="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-shell bg-paper-50 px-3 py-1.5 text-xs font-semibold tracking-[0.12em] text-ink transition hover:bg-paper-200 active:bg-paper-200"
				>
					Reset match state
				</button>
			</div>

			<button
				type="button"
				onClick={handleRegenerate}
				class="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-shell bg-paper-100 px-3 py-1.5 text-xs font-semibold tracking-[0.12em] text-ink transition hover:bg-paper-200 active:bg-paper-200"
			>
				Regenerate board
			</button>

			<div class="mt-3 rounded-lg border border-shell bg-paper-100/80 px-3 py-2">
				<div class="space-y-2">
					<div class="flex items-center justify-between gap-3 text-[0.65rem] uppercase tracking-[0.2em] text-label-soft">
						<span>Solver words</span>
						<span class="text-ink">{words().length}</span>
					</div>
					{words().length > 0
						? (
							<ul class="max-h-40 space-y-1 overflow-auto text-[0.72rem] leading-5 text-ink">
								<For each={words()}>
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
			</div>
		</aside>
	)
}

export default DeveloperPanel
