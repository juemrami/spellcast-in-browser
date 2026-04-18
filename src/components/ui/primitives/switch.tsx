import type { ComponentProps } from "solid-js"
import "./switch.css"
export const Switch = (
	props: {
		ariaLabel?: string
		class?: ComponentProps<"label">["class"]
		checked?: boolean
		onChange: (checked: boolean) => void
	}
) => (
	<label class={`relative inline-flex cursor-pointer items-center ${props.class ?? ""}`}>
		<input
			type="checkbox"
			aria-label={props.ariaLabel}
			class="sr-only peer"
			checked={props.checked}
			onChange={(e) => props.onChange(e.currentTarget.checked)}
		/>
		<div class="group peer base-switch" />
	</label>
)
