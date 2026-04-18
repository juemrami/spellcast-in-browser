import { useAtomSet } from "@effect/atom-solid"
import { type Component, createMemo, For, Show } from "solid-js"
import { GameMatchPhase, type GameStateSnapshot, type ScoreEntry } from "../../services/GameStateMachine"
import { playerState } from "../../services/layers"
import type { Tile } from "../../types/game"
import TurnOrderBadge from "../ui/TurnOrderBadge"

// Matches the TURN_COLORS palette used in PlayerScoreboard
const TURN_COLORS = [
	{ bg: "#f7d1d5", border: "#d89ca4", text: "#5f2431", dot: "#c4717e", accent: "#e8a0ac" },
	{ bg: "#d9ede4", border: "#9fbbb2", text: "#24413f", dot: "#6aaa8e", accent: "#8ec4a8" },
	{ bg: "#faecd0", border: "#d4a96a", text: "#5a3a10", dot: "#c08230", accent: "#d9a554" },
	{ bg: "#e9e4f5", border: "#b8a8d8", text: "#3b2468", dot: "#8b6cca", accent: "#a48ed6" }
] as const

const MINI_TILE_STYLES: Record<Tile["type"], string> = {
	normal:
		"border-tile-normal-border bg-gradient-to-br from-tile-normal-from via-tile-normal-via to-tile-normal-to text-tile-normal-text ring-1 ring-inset ring-white/70",
	gem:
		"border-tile-gem-border bg-gradient-to-br from-tile-gem-from via-tile-gem-via to-tile-gem-to text-tile-gem-text ring-1 ring-inset ring-white/60",
	multiplier:
		"border-tile-multiplier-border bg-gradient-to-br from-tile-multiplier-from via-tile-multiplier-via to-tile-multiplier-to text-tile-multiplier-text ring-1 ring-inset ring-white/60"
}

const MiniTile: Component<{ tile: Tile }> = (props) => (
	<div
		class={`flex select-none items-center justify-center rounded-[0.32rem] border text-[0.65rem] font-extrabold uppercase leading-none tracking-[0.08em] shadow-tile size-[2rem] ${
			MINI_TILE_STYLES[props.tile.type]
		}`}
	>
		{props.tile.letter}
	</div>
)

type RoundSummaryState = GameStateSnapshot & { phase: typeof GameMatchPhase.BetweenRounds }

const RoundSummary: Component<{ state: RoundSummaryState }> = (props) => {
	const startNextRound = useAtomSet(() => playerState.startCurrentGame)

	const lastRound = createMemo(() => {
		const { rounds, currentRoundId } = props.state
		if (currentRoundId === null) return null
		return rounds.find((r) => r.id === currentRoundId) ?? null
	})

	const playerEntries = createMemo(() => {
		const round = lastRound()
		const { players } = props.state
		const turnOrder = round ? [...round.turnOrder] : players.map((p) => p.id)
		const playersById = new Map(players.map((p) => [p.id, p]))

		const scoresByPlayer = new Map<string, Array<ScoreEntry>>()
		if (round) {
			for (const entry of round.scores) {
				const existing = scoresByPlayer.get(entry.playerId) ?? []
				scoresByPlayer.set(entry.playerId, [...existing, entry])
			}
		}

		return turnOrder
			.map((id, turnIndex) => {
				const player = playersById.get(id)
				if (!player) return null
				const words = scoresByPlayer.get(id) ?? []
				const roundPoints = words.reduce((sum, e) => sum + e.points, 0)
				return { player, turnIndex, words, roundPoints }
			})
			.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
	})

	return (
		<div class="flex w-full flex-col items-center gap-5">
			<div class="flex flex-col items-center gap-1">
				<p class="text-[0.62rem] font-semibold uppercase tracking-[0.45em] text-label-muted">
					Round {lastRound()?.id ?? "—"} complete
				</p>
				<h2 class="font-display text-[1.6rem] font-bold leading-tight tracking-wide text-header">
					Results
				</h2>
			</div>

			<div class="flex w-full flex-col gap-3">
				<For each={playerEntries()}>
					{(entry) => {
						const color = TURN_COLORS[entry.turnIndex % TURN_COLORS.length]
						const sortedWords = [...entry.words].sort((a, b) => b.points - a.points)
						return (
							<div
								style={{
									"background-color": color.bg,
									"border-color": color.border,
									"color": color.text
								}}
								class="flex flex-col gap-2 rounded-xl border px-3 pt-2 pb-3 shadow-card"
							>
								{/* Player header */}
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-2">
										<TurnOrderBadge turnIndex={entry.turnIndex} dotColor={color.dot} />
										<span class="max-w-[14ch] truncate text-sm font-bold tracking-wide">
											{entry.player.name}
										</span>
									</div>
									<div class="flex flex-col items-end gap-0.5">
										<span class="tabular-nums text-base font-bold leading-none mr-1">
											+{entry.roundPoints}
											<span class="ml-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] opacity-55">
												pts
											</span>
										</span>
										<span class="text-[0.8rem] font-semibold tabular-nums opacity-55 text-center">
											<span class="mr-1 opacity-190 font-bold">{entry.player.score}</span>total
										</span>
									</div>
								</div>

								{/* Divider */}
								<div
									style={{ "background-color": color.accent }}
									class="h-px w-full opacity-40"
								/>

								{/* Words */}
								<div class="flex flex-col gap-1.5">
									<Show
										when={sortedWords.length > 0}
										fallback={
											<p class="rounded-lg bg-black/[0.06] px-2.5 py-1.5 text-[0.68rem] font-medium opacity-50">
												No words submitted this round
											</p>
										}
									>
										<For each={sortedWords}>
											{(wordEntry) => (
												<div class="flex items-center gap-2 rounded-lg bg-black/[0.06] px-2 py-1.5">
													<div class="flex flex-wrap gap-[3px]">
														<For each={wordEntry.path}>
															{(tile) => <MiniTile tile={tile} />}
														</For>
													</div>
												</div>
											)}
										</For>
									</Show>
								</div>
							</div>
						)
					}}
				</For>
			</div>

			<button
				type="button"
				onClick={() => startNextRound()}
				class="mt-1 inline-flex items-center gap-2 rounded-full border border-control-border bg-gradient-to-b from-control-from to-control-to px-7 py-2.5 text-[0.8rem] font-bold uppercase tracking-[0.28em] text-control-text shadow-button transition hover:-translate-y-0.5 active:translate-y-0"
			>
				Next round →
			</button>
		</div>
	)
}

export default RoundSummary
