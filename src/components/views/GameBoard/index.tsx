import { useAtom, useAtomMount } from "@effect/atom-solid"
import type { Data } from "effect"
import type { GameMatchState } from "../../../services/GameStateMachine"
import { clientPlayer } from "../../../services/layers"
import { Switch } from "../../ui/primitives/switch"
import Board from "./Board"
import CurrentWord from "./CurrentWord"
import PlayerScoreboard from "./PlayerScoreboard"
import SubmitButton from "./SubmitButton"
import TurnTimer from "./TurnTimer"

// oxlint-disable-next-line no-unused-vars
const board = (props: { state: Data.TaggedEnum.Value<GameMatchState, "InRound"> }) => {
	const [autoSubmit, setAutoSubmit] = useAtom(() => clientPlayer.atoms.autoSubmit.value)
	useAtomMount(() => clientPlayer.atoms.autoSubmit.effect)
	return (
		<>
			<PlayerScoreboard class="mb-2" />
			<div class="mb-2 flex w-full items-center gap-3">
				<TurnTimer class="min-w-0 flex-1" />
				<div class="flex shrink-0 items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-badge">
					<span class="text-label-muted">auto-submit</span>
					<Switch ariaLabel="Auto-submit" class="shrink-0" checked={autoSubmit()} onChange={setAutoSubmit} />
				</div>
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
