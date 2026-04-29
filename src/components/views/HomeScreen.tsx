import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { Match, Option } from "effect"
import { isNotUndefined } from "effect/Predicate"
import type { Component } from "solid-js"
import { createSignal } from "solid-js"
import { router } from "../../App"
import { GameMatchState, GameState } from "../../services/GameStateMachine"
import { gameStateMachine, p2pSession } from "../../services/layers"

const HomeScreen: Component = () => {
	const mutateRouter = useAtomSet(() => router.mutate)
	const currentGame = useAtomValue(() => gameStateMachine.atoms.state)
	const activeSession = useAtomValue(() => p2pSession.atoms.active)
	const joinSession = useAtomSet(() => p2pSession.atoms.join)
	const matchInfo = () => {
		if (Option.isNone(activeSession())) return undefined
		const state = currentGame()
		if (!GameState.$is("Active")(state)) return undefined
		return GameMatchState.$match(state.snapshot, {
			InLobby: (match) => `In Lobby (${match.players.length} players)`,
			InRound: (match) => `Round ${match.currentRound.id} In Progress.`,
			BetweenRounds: (match) => `Waiting for next round... (${match.lastRound.id} complete)`,
			MatchRecap: () => `View final scores.`
		})
	}
	const [joinCode, setJoinCode] = createSignal("")
	const onJoinLobby = (lobbyId?: string) => {
		const id = lobbyId ?? crypto.randomUUID().slice(0, 6)
		joinSession(id)
		mutateRouter({
			mutation: (url) => {
				url.searchParams.set("id", id)
				url.pathname = "/lobby"
			},
			pushHistory: true
		})
	}

	const tryJoinLobby = (event: Event) => {
		event.preventDefault()
		const id = joinCode().trim()
		if (!id) return
		onJoinLobby(id)
		setJoinCode("")
	}

	return (
		<div class="flex flex-col items-stretch gap-5 p-3 pt-5 sm:gap-6 sm:p-5 w-full max-w-100">
			{/* Create Game — hero action, mint/multiplier palette */}
			<button
				type="button"
				class="group relative overflow-hidden rounded-2xl border border-tile-multiplier-border bg-gradient-to-b from-tile-multiplier-from via-tile-multiplier-via to-tile-multiplier-to px-4 py-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-sm"
				onClick={() => onJoinLobby()}
			>
				<div class="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 bg-gradient-to-b from-tile-multiplier-hover-from via-tile-multiplier-hover-via to-tile-multiplier-hover-to" />
				<div class="relative z-10 flex flex-col items-center gap-1.5">
					<span class="font-display text-[1.65rem] font-bold leading-none tracking-tight text-tile-multiplier-text">
						{matchInfo() ? "Resume Game" : "Create Game"}
					</span>
					<span class="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-tile-multiplier-text/70">
						{Match.value(matchInfo()).pipe(
							Match.when(isNotUndefined, (info) => `${info}`),
							Match.orElse(() => "Host a new match")
						)}
					</span>
				</div>
			</button>

			{/* Join Game — secondary action, amber/control palette */}
			<form
				onSubmit={tryJoinLobby}
				class="relative overflow-hidden rounded-2xl border border-control-border bg-gradient-to-b from-control-from to-control-to px-4 py-4 shadow-sm"
			>
				<div class="relative z-10 flex flex-col gap-3">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
						<div>
							<span class="font-display text-xl font-bold tracking-tight text-[#3B2A12]">
								Join Game
							</span>
						</div>
						<div class="flex flex-1 items-center gap-2">
							<label class="sr-only" for="lobby-code-input">
								Lobby code
							</label>
							<input
								id="lobby-code-input"
								type="text"
								value={joinCode()}
								onInput={(event) => setJoinCode(event.currentTarget.value)}
								placeholder="Lobby code"
								class="flex-1 rounded-2xl border border-control-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-control-text focus:ring-2 focus:ring-control-text/20"
							/>
							<button
								type="submit"
								class="rounded-2xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={!joinCode().trim()}
							>
								Join
							</button>
						</div>
					</div>
					<span class="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#5F3A10]">
						Enter with a code
					</span>
				</div>
			</form>
		</div>
	)
}

export default HomeScreen
