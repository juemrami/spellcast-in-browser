import { useAtomValue } from "@effect/atom-solid"
import { Match } from "effect"
import { type Component, createMemo, For, splitProps } from "solid-js"
import { GameMatchRound } from "../../../services/GameStateMachine"
import { currentGameStateMachine } from "../../../services/layers"
import TurnOrderBadge from "../../ui/TurnOrderBadge"

// Ordered color palette for turn positions (rose, mint, sun, lavender)
const TURN_COLORS: ReadonlyArray<{ bg: string; border: string; text: string; dot: string }> = [
	{ bg: "#f7d1d5", border: "#d89ca4", text: "#5f2431", dot: "#c4717e" },
	{ bg: "#d9ede4", border: "#9fbbb2", text: "#24413f", dot: "#6aaa8e" },
	{ bg: "#faecd0", border: "#d4a96a", text: "#5a3a10", dot: "#c08230" },
	{ bg: "#e9e4f5", border: "#b8a8d8", text: "#3b2468", dot: "#8b6cca" }
]

const PlayerScoreboard: Component<{ class?: string }> = (props) => {
	const [local, _rest] = splitProps(props, ["class"])
	const currentGame = useAtomValue(() => currentGameStateMachine)

	const rows = createMemo(() => {
		const result = Match.valueTags(currentGame(), {
			Active: ({ snapshot }) => snapshot,
			Crashed: (_) => null
		})
		if (!result) return []
		const { players, rounds, currentRound } = result
		const round = currentRound !== null
			? rounds.find((r) => r.id === currentRound.id) ?? null
			: null
		const playersById = new Map(players.map((p) => [p.id, p]))
		if (round && GameMatchRound.$is("InProgress")(round)) {
			return round.turnOrder
				.map((id, turnIndex) => {
					const player = playersById.get(id)
					if (!player) return null
					return {
						player,
						turnIndex,
						isActive: round.currentTurn.playerId === id
					}
				})
				.filter((entry) => entry !== null)
		}
		return players.map((player, turnIndex) => ({ player, turnIndex, isActive: false }))
	})

	return (
		<div class={`flex flex-row gap-2 ${local.class ? ` ${local.class}` : ""}`}>
			<For each={rows()}>
				{(entry) => {
					const color = TURN_COLORS[entry.turnIndex % TURN_COLORS.length]
					return (
						<div
							style={{
								"background-color": color.bg,
								"border-color": color.border,
								"color": color.text
							}}
							class="flex flex-col max-w-30 flex-1 items-center rounded-lg border transition-all pt-1.5"
							classList={{ "opacity-50": !entry.isActive, "opacity-100 shadow-sm": entry.isActive }}
						>
							<div class="min-w-0 flex w-max truncate text-sm font-semibold tracking-wide items-center space-x-1">
								<TurnOrderBadge turnIndex={entry.turnIndex} dotColor={color.dot} />
								<p class="text-tightest text-sm max-w-[12ch] text-ellipsis" title={entry.player.name}>
									{entry.player.name}
								</p>
							</div>
							<span class="shrink-0 tabular-nums text-sm font-bold">
								{entry.player.score}
								<span class="ml-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] opacity-60">
									pts
								</span>
							</span>
						</div>
					)
				}}
			</For>
		</div>
	)
}

export default PlayerScoreboard
