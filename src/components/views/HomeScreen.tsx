import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { Match, Option } from "effect"
import { isNotUndefined } from "effect/Predicate"
import type { Component } from "solid-js"
import { router } from "../../App"
import { GameMatchState, GameState } from "../../services/GameStateMachine"
import { gameSession, gameStateMachine } from "../../services/layers"

const HomeScreen: Component = () => {
	const mutateRouter = useAtomSet(() => router.mutate)
	const currentGame = useAtomValue(() => gameStateMachine.atoms.state)
	const activeSession = useAtomValue(() => gameSession.active)
	const joinSession = useAtomSet(() => gameSession.join)
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
	const onJoinLobby = (lobbyId?: string) => {
		const id = lobbyId ?? crypto.randomUUID().slice(0, 6)
		joinSession(id)
		mutateRouter({
			mutation: (url) => {
				url.searchParams.set("lobby", id)
				url.pathname = "/match"
			},
			pushHistory: true
		})
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
			<button
				type="button"
				disabled
				class="group relative overflow-hidden rounded-2xl border border-control-border bg-gradient-to-b from-control-from to-control-to px-4 py-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
			>
				<div class="relative z-10 flex flex-col items-center gap-1">
					<span class="font-display text-xl font-bold tracking-tight text-control-text">
						Join Game
					</span>
					<span class="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-control-text/50">
						Enter with a code
					</span>
				</div>
			</button>
		</div>
	)
}

export default HomeScreen
