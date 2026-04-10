import type { Component } from "solid-js"

const SubmitButton: Component = () => (
	<button
		type="button"
		disabled
		class="inline-flex items-center justify-center rounded-full border border-control-border bg-gradient-to-b from-control-from to-control-to px-5 py-2.5 text-sm font-semibold tracking-[0.22em] text-control-text shadow-[0_8px_0_color-mix(in_srgb,var(--color-ink)_14%,transparent),0_18px_30px_color-mix(in_srgb,var(--color-ink)_12%,transparent)] transition disabled:cursor-not-allowed disabled:opacity-70"
	>
		Submit Word
	</button>
)

export default SubmitButton
