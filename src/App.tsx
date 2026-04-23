import { type Component } from "solid-js"

import { useAtom } from "@effect/atom-solid"
import { Effect, Match, Result } from "effect"
import SiteLayout from "./components/Layout"
import GameMatch from "./components/views/GameMatch"
import HomeScreen from "./components/views/HomeScreen"
import { TypedSpaRouter } from "./services/SpaAtomRouter"

export const router = Effect.runSync(TypedSpaRouter.make({
	paths: [
		{
			route: "/",
			aliases: ["/home"]
		},
		{ route: "/match", aliases: [] }
	]
}))

const App: Component = () => {
	const [currentPath, setCurrentPath] = useAtom(() => router.pathname)
	return (
		<SiteLayout>
			{Result.match(currentPath(), {
				onSuccess: (path) => {
					console.log("Current path:", path)
					return Match.value(path).pipe(
						Match.whenOr("/", "/home", () => <HomeScreen />),
						Match.when("/match", () => <GameMatch />),
						Match.exhaustive
					)
				},
				onFailure: (error) => {
					// Handle path resolution failure
					console.error(error.message)
					alert(`Error: ${error.message}`)
					setCurrentPath({ path: "/home", pushHistory: false }) // Redirect to home on error
					return <></>
				}
			})}
		</SiteLayout>
	)
}
export default App
