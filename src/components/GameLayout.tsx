import { useAtom, useAtomValue } from "@effect/atom-solid"
import { type Component, createSignal, Show } from "solid-js"

import { Match } from "effect"
import { boardService, gameState, playerGameState } from "../services/layers"
import Board from "./Board"
import CurrentWord from "./CurrentWord"
import DeveloperPanel from "./DeveloperPanel"
import SubmitButton from "./SubmitButton"
import { Switch as UiSwitch } from "./ui/switch"

const GameLayout: Component = () => {
	const tileCount = useAtomValue(() => boardService.tileCount)
	const [isDeveloperPanelOpen, setDeveloperPanelOpen] = createSignal(false)
	const [playerMeta, setPlayerMeta] = useAtom(() => playerGameState.playerMeta)
	const [gamestate, setGamestate] = useAtom(() => gameState.state)
	const [playerName, setPlayerName] = createSignal(playerMeta()?.name ?? "")

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
					{Match.value(gamestate()).pipe(
						Match.when({ phase: "lobby" }, (state) => (
							<form
								class="flex w-full flex-col items-center gap-5"
								onSubmit={(event) => {
									event.preventDefault()
									const trimmedName = playerName().trim()
									if (trimmedName.length === 0) {
										return
									}
									const player = {
										id: playerMeta()?.id ?? crypto.randomUUID(),
										name: trimmedName
									}
									setPlayerMeta(player)
									setGamestate({
										type: "joinLobby",
										player
									})
								}}
							>
								<p class="text-center text-sm font-semibold uppercase tracking-[0.28em] text-label">
									Waiting for players to join...
								</p>
								<div class="w-full rounded-xl border border-shell bg-paper-50 px-3 py-2 text-left text-xs font-semibold tracking-[0.12em] text-ink">
									<div class="flex items-center justify-between gap-3 uppercase tracking-[0.2em] text-label-soft">
										<span>Players</span>
										<span>{state.players.length}</span>
									</div>
									<div class="mt-3 space-y-2">
										{state.players.length > 0
											? state.players.map((player) => (
												<div class="flex items-center justify-between gap-4 rounded-lg bg-paper-100 px-3 py-2">
													<div class="flex items-center gap-2">
														<span class="font-semibold tracking-[0.1em] text-header">
															{player.name}
														</span>
														{playerMeta()?.id === player.id
															? (
																<span class="text-[0.72rem] font-medium tracking-[0.08em] text-label-muted">
																	(you)
																</span>
															)
															: null}
													</div>
													<span class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-label-muted">
														Joined {player.joinedAt !== null
															? new Date(player.joinedAt).toLocaleTimeString([], {
																hour: "numeric",
																minute: "2-digit"
															})
															: "just now"}
													</span>
												</div>
											))
											: (
												<p class="rounded-lg bg-paper-100 px-3 py-2 text-[0.72rem] font-medium tracking-[0.08em] text-label-muted">
													No players yet.
												</p>
											)}
									</div>
								</div>
								<div class="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-end">
									<label class="flex w-full flex-col gap-2 text-left sm:flex-[1_1_auto]">
										<span class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-label-soft">
											Display name
										</span>
										<input
											autofocus
											type="text"
											value={playerName()}
											onInput={(event) => setPlayerName(event.currentTarget.value)}
											placeholder="Your name"
											maxLength={24}
											class="w-full rounded-2xl border border-shell bg-paper-50 px-4 py-3 text-base text-ink outline-none transition placeholder:text-label-muted focus:border-control-border focus:ring-2 focus:ring-control-border/30"
										/>
									</label>
									<button
										type="submit"
										class="inline-flex w-full items-center justify-center rounded-full border border-control-border bg-gradient-to-b from-control-from to-control-to px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-control-text shadow-button transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-36"
										disabled={playerName().trim().length === 0}
									>
										Join lobby
									</button>
								</div>
							</form>
						)),
						Match.when(
							{ phase: "in-round" },
							(_state) => (
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
					)}
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
