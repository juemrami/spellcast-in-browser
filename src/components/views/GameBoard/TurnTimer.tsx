import { useAtomValue } from "@effect/atom-solid"
import { Duration } from "effect"
import { type ComponentProps, createMemo, createSignal, onCleanup, Show, splitProps } from "solid-js"
import { isActiveTurnState } from "../../../services/GameStateMachine"
import { currentGameStateMachine, playerState } from "../../../services/layers"

const CurrentTurnTimer = (props: ComponentProps<"div">) => {
	const [local, rest] = splitProps(props, ["class"])
	const gameState = useAtomValue(() => currentGameStateMachine)
	const isPlayerTurn = useAtomValue(() => playerState.isPlayerTurn)

	const [now, setNow] = createSignal(Date.now())
	const interval = setInterval(() => setNow(Date.now()), 100)
	onCleanup(() => clearInterval(interval))
	const turnInfo = createMemo(() => {
		const state = gameState()
		if (isActiveTurnState(state)) {
			const { endsAtMs } = state.snapshot.currentRound.currentTurn
			const totalMs = Duration.toMillis(state.snapshot.currentRound.turnDuration)
			return { endsAtMs, totalMs }
		}
		return null
	})

	const secondsRemaining = () => {
		const info = turnInfo()
		if (!info) return 0
		return Math.max(0, Math.ceil((info.endsAtMs - now()) / 1000))
	}

	const progressPercent = () => {
		const info = turnInfo()
		if (!info) return 0
		return Math.max(0, Math.min(100, ((info.endsAtMs - now()) / info.totalMs) * 100))
	}

	const isUrgent = () => secondsRemaining() <= 15

	return (
		<Show when={turnInfo()} fallback={<div class={local.class} />}>
			<div {...rest} class={`flex items-center gap-2 pr-4 ${local.class ?? ""}`}>
				<div class="flex shrink-0 flex-col gap-0.25">
					<span class="text-[0.56rem] font-semibold uppercase text-tightest tracking-[0.2em] text-label-faint">
						{isPlayerTurn() ? "Your Turn" : "Opponent's Turn"}
					</span>
					<div
						class="tabular-nums text-tightest transition-colors duration-500 w-min mt-1.5 mx-auto px-0.5"
						classList={{
							"text-label": !isUrgent(),
							"text-[#5f2431]": isUrgent()
						}}
					>
						<span class="font-display text-lg font-bold relative text-right">
							{secondsRemaining()}
							<span class="absolute text-[0.58rem] font-semibold uppercase tracking-[0.15em] opacity-60 -right-2.25 bottom-0.25">
								s
							</span>
						</span>
					</div>
				</div>
				<div class="relative h-[6px] flex-1 self-center overflow-hidden rounded-full bg-shell/50">
					<div
						class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ease-linear"
						classList={{
							"bg-label-soft": !isUrgent(),
							"bg-[#d89ca4]": isUrgent()
						}}
						style={{ width: `${progressPercent()}%` }}
					/>
				</div>
			</div>
		</Show>
	)
}

export default CurrentTurnTimer
