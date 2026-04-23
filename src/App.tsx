import { type Component } from "solid-js"

import { useAtom } from "@effect/atom-solid"
import { Effect, Match, Result } from "effect"
import GameLayout from "./components/Layout"
import HomeScreen from "./components/views/HomeScreen"
import { TypedSpaRouter } from "./services/SpaAtomRouter"

export const router = Effect.runSync(TypedSpaRouter.make({
	paths: [
		{
			route: "/",
			aliases: ["/home"]
		}
	]
}))

const App: Component = () => {
	const [currentPath, setCurrentPath] = useAtom(() => router.pathname)
	return (
		<GameLayout>
			{Result.match(currentPath(), {
				onSuccess: (path) => {
					return Match.value(path).pipe(
						Match.whenOr("/", "/home", () => <HomeScreen />),
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
		</GameLayout>
	)
}
export default App
