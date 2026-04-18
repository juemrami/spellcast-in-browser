import { GameMatchPhase, type GameStateSnapshot } from "../../../services/GameStateMachine"
import { Switch } from "../../ui/primitives/switch"
import Board from "./Board"
import CurrentWord from "./CurrentWord"
import PlayerScoreboard from "./PlayerScoreboard"
import SubmitButton from "./SubmitButton"
const board = <S extends GameStateSnapshot & { phase: typeof GameMatchPhase.InRound }>(props: { state: S }) => {
	return (
		<>
			<PlayerScoreboard class="mb-2" />
			<div class="mb-2 flex w-full items-center justify-end gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-badge">
				<span class="text-label-muted">auto-submit</span>
				<Switch ariaLabel="Auto-submit" class="shrink-0" onChange={() => {}} />
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
}
export default board
