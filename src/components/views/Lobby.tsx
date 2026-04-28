import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-solid"
import type { Component } from "solid-js"
import { For } from "solid-js"

import { Option, pipe } from "effect"
import { router } from "../../App"
import { MIN_PLAYERS } from "../../services/GameStateMachine"
import { clientPlayer, gameSession, lobbyContext } from "../../services/layers"

const Lobby: Component = () => {
	// const joinLobby = useAtomSet(() => clientPlayer.atoms.game.joinLobby)
	const [matchConfig, setMatchConfig] = useAtom(() => lobbyContext.atoms.matchConfig)
	const p2pSession = useAtomValue(() => gameSession.active)
	const startCurrentGame = useAtomSet(() => clientPlayer.atoms.game.start)
	const players = useAtomValue(() => lobbyContext.atoms.allPlayers)
	const userPeer = useAtomValue(() => lobbyContext.atoms.user)
	const [playerName, setPlayerName] = useAtom(() => clientPlayer.atoms.playerName)
	const mutateRouter = useAtomSet(() => router.mutate)
	const playerId = () => userPeer().id
	const peers = useAtomValue(() => gameSession.peers)
	const rawPeers = useAtomValue(() => gameSession.peers)
	if (Option.isNone(p2pSession())) {
		console.error("No active game session found. Redirecting to home.")
		mutateRouter({
			mutation: (url) => {
				url.pathname = "/"
				url.searchParams.delete("id")
			},
			pushHistory: false
		})
		return (
			<p class="text-center text-sm font-semibold uppercase tracking-[0.28em] text-red-500">
				Error: No active game session found.
			</p>
		)
	}
	return (
		<form
			class="flex w-full flex-col items-center gap-5"
			onSubmit={(event: SubmitEvent) => {
				event.preventDefault()
			}}
		>
			<p>{console.log(rawPeers()) ?? JSON.stringify(rawPeers(), null, 2)}</p>
			<p class="text-center text-sm font-semibold uppercase tracking-[0.28em] text-label">
				Waiting for players to join...
			</p>
			<div>
				{pipe(
					peers(),
					Option.map((p) => Array.from(p.values()).map((p) => p.id)),
					Option.getOrUndefined
				)}
			</div>
			<div class="flex w-full flex-col gap-2 text-left">
				<span class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-label-soft">
					Match format
				</span>
				<div class="flex w-full items-stretch gap-2">
					<For each={[3, 5, 7] as const}>
						{(rounds) => (
							<label class="group flex flex-[1_1_auto] cursor-pointer items-center justify-center rounded-xl border px-3 py-3 transition-all duration-150 border-shell bg-paper-50 hover:border-tile-gem-border/60 has-[:checked]:border-tile-gem-border has-[:checked]:bg-gradient-to-b has-[:checked]:from-tile-gem-from has-[:checked]:to-tile-gem-via has-[:checked]:shadow-sm">
								<input
									type="radio"
									name="matchRounds"
									class="hidden"
									value={rounds}
									checked={matchConfig().numRounds === rounds}
									onChange={() => setMatchConfig({ numRounds: rounds })}
								/>
								<span class="text-xs font-bold uppercase tracking-[0.2em] text-label-soft transition-colors group-has-[:checked]:text-tile-gem-text">
									{rounds} Rounds
								</span>
							</label>
						)}
					</For>
				</div>
			</div>
			<div class="w-full rounded-xl border border-shell bg-paper-50 px-3 py-2 text-left text-xs font-semibold tracking-[0.12em] text-ink">
				<div class="flex items-center justify-between gap-3 uppercase tracking-[0.2em] text-label-soft">
					<span>Players</span>
					<span>{players().length}</span>
				</div>
				<div class="mt-3 space-y-2">
					{players().length > 0
						? (
							<For each={players()}>
								{(player) => (
									<div class="flex items-center justify-between gap-4 rounded-lg bg-paper-100 px-3 py-2">
										<div class="flex items-center gap-2">
											<span class="font-semibold tracking-[0.1em] text-header">
												{player.name}
											</span>
											{playerId() === player.id
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
								)}
							</For>
						)
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
					class="inline-flex w-full items-center justify-center rounded-full border border-control-border bg-gradient-to-b from-control-from to-control-to px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-control-text shadow-button transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-36 whitespace-nowrap"
					disabled={playerName().trim().length === 0}
				>
					{"Update name"}
				</button>
			</div>
			<div class="flex w-full flex-col items-stretch gap-2">
				<button
					type="button"
					onClick={() => {
						if (players().length < MIN_PLAYERS) {
							return
						}
						startCurrentGame()
					}}
					disabled={players().length < MIN_PLAYERS}
					class="inline-flex w-full items-center justify-center rounded-full border border-control-border bg-gradient-to-b from-control-from to-control-to px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-control-text shadow-button transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:brightness-100 sm:w-auto sm:min-w-36"
				>
					Start game
				</button>
				<p class="text-center text-[0.72rem] font-medium tracking-[0.08em] text-label-muted">
					Add at least {MIN_PLAYERS} players to begin.
				</p>
			</div>
		</form>
	)
}

export default Lobby
