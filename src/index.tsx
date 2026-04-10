/* @refresh reload */
import { render } from "solid-js/web"
import "./index.css"

import App from "./App"

const themeColor = getComputedStyle(document.documentElement)
	.getPropertyValue("--color-browser")
	.trim()

if (themeColor) {
	const metaThemeColor = document.querySelector<HTMLMetaElement>("meta[name=\"theme-color\"]") ??
		document.head.appendChild(document.createElement("meta"))

	metaThemeColor.setAttribute("name", "theme-color")
	metaThemeColor.setAttribute("content", themeColor)
}

const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
	throw new Error(
		"Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?"
	)
}

render(() => <App />, root!)
