import type { Component } from "solid-js"

const TurnOrderBadge: Component<{ turnIndex: number; dotColor: string }> = (props) => (
	<div
		style={{ "background-color": props.dotColor }}
		class="h-3.5 w-4 rounded-full grid place-items-center shrink-0"
	>
		<p class="text-xs text-white text-center font-bold align-middle text-tightest w-min max-w-[16ch] h-min mb-[1px]">
			{props.turnIndex + 1}
		</p>
	</div>
)

export default TurnOrderBadge
