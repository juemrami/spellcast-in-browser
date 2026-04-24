import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { Match } from "effect"
import { router } from "../../../App"
import { GameMatchState } from "../../../services/GameStateMachine"
import { gameStateMachine } from "../../../services/layers"
import GameBoard from "./GameBoard"
import Lobby from "./Lobby"
import RoundSummary from "./RoundSummary"

export default function GameMatch() {
	const currentGame = useAtomValue(() => gameStateMachine.atoms.state)
	const setRouterPath = useAtomSet(() => router.pathname)
	return (
		<section class="w-full max-w-[31.5rem] rounded-[2rem] border border-shell bg-gradient-to-b from-paper-50 to-paper-100 p-2 shadow-panel-hero sm:p-4">
			{Match.valueTags(currentGame(), {
				Idle: (_) => {
					setRouterPath({ path: "/", pushHistory: false })
					return <>No match found. Rerouting...</>
				},
				Active: ({ snapshot }) =>
					GameMatchState.$match(snapshot, {
						InLobby: (state) => <Lobby players={state.players} config={state.config} />,
						InRound: (state) => <GameBoard state={state} />,
						BetweenRounds: (state) => <RoundSummary state={state} />,
						MatchRecap: (state) => <RoundSummary state={state} />
					}),
				Crashed: ({ cause: error }) => (
					<p class="text-center text-sm font-semibold uppercase tracking-[0.28em] text-red-500">
						Failed to load game state.
						{console.error(error) ?? error.toString()}
					</p>
				)
			})}
		</section>
	)
}
