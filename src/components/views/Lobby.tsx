import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-solid"
import type { Component } from "solid-js"
import { For } from "solid-js"

import { type LobbyPlayer, MIN_PLAYERS } from "../../services/GameStateMachine"
import { playerState } from "../../services/layers"

interface LobbyProps {
	readonly players: ReadonlyArray<LobbyPlayer>
}

const Lobby: Component<LobbyProps> = (props) => {
	const joinLobby = useAtomSet(() => playerState.joinCurrentGameLobby)
	const startCurrentGame = useAtomSet(() => playerState.startCurrentGame)
	const [playerName, setPlayerName] = useAtom(() => playerState.meta.playerName)
	const playerId = useAtomValue(() => playerState.meta.playerId)

	return (
		<form
			class="flex w-full flex-col items-center gap-5"
			onSubmit={(event: SubmitEvent) => {
				event.preventDefault()
				const trimmedName = playerName().trim()
				if (trimmedName.length === 0) {
					setPlayerName(`Player-${Math.floor(Math.random() * 1000)}`)
				}
				joinLobby()
			}}
		>
			<p class="text-center text-sm font-semibold uppercase tracking-[0.28em] text-label">
				Waiting for players to join...
			</p>
			<div class="w-full rounded-xl border border-shell bg-paper-50 px-3 py-2 text-left text-xs font-semibold tracking-[0.12em] text-ink">
				<div class="flex items-center justify-between gap-3 uppercase tracking-[0.2em] text-label-soft">
					<span>Players</span>
					<span>{props.players.length}</span>
				</div>
				<div class="mt-3 space-y-2">
					{props.players.length > 0
						? (
							<For each={props.players}>
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
					class="inline-flex w-full items-center justify-center rounded-full border border-control-border bg-gradient-to-b from-control-from to-control-to px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-control-text shadow-button transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-36"
					disabled={playerName().trim().length === 0}
				>
					Join lobby
				</button>
			</div>
			<div class="flex w-full flex-col items-stretch gap-2">
				<button
					type="button"
					onClick={() => {
						if (props.players.length < MIN_PLAYERS) {
							return
						}
						startCurrentGame()
					}}
					disabled={props.players.length < MIN_PLAYERS}
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
