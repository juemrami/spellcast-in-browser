import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"

export default defineConfig({
	plugins: [solidPlugin(), tailwindcss()],
	server: {
		watch: {
			ignored: [
				"**/.jj/**",
				"**/wordlists/**"
			]
		},
		port: 3000
	},
	build: {
		target: "esnext"
	}
})
