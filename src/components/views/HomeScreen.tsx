import type { Component } from "solid-js"

const HomeScreen: Component = () => {
	return (
		<div class="flex flex-col items-stretch gap-5 p-3 pt-5 sm:gap-6 sm:p-5 w-full max-w-100">
			{/* Create Game — hero action, mint/multiplier palette */}
			<button
				type="button"
				class="group relative overflow-hidden rounded-2xl border border-tile-multiplier-border bg-gradient-to-b from-tile-multiplier-from via-tile-multiplier-via to-tile-multiplier-to px-4 py-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-sm"
			>
				<div class="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 bg-gradient-to-b from-tile-multiplier-hover-from via-tile-multiplier-hover-via to-tile-multiplier-hover-to" />
				<div class="relative z-10 flex flex-col items-center gap-1.5">
					<span class="font-display text-[1.65rem] font-bold leading-none tracking-tight text-tile-multiplier-text">
						Create Game
					</span>
					<span class="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-tile-multiplier-text/50">
						Host a new match
					</span>
				</div>
			</button>

			{/* Join Game — secondary action, amber/control palette */}
			<button
				type="button"
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
