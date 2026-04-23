import { useAtom, useAtomValue } from "@effect/atom-solid"
import { Effect, Match, Result } from "effect"
import type { Component } from "solid-js"
import SiteLayout from "./components/Layout"
import GameMatch from "./components/views/GameMatch"
import HomeScreen from "./components/views/HomeScreen"
import { GameState } from "./services/GameStateMachine"
import { gameStateMachine } from "./services/layers"
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
	const currentGame = useAtomValue(() => gameStateMachine.atoms.state)
	const isInMatch = () => {
		const state = currentGame()
		if (GameState.$is("Active")(state)) {
			return true
		}
		return false
	}
	return (
		<SiteLayout>
			{Result.match(currentPath(), {
				onSuccess: (path) => {
					return Match.value(path).pipe(
						Match.whenOr("/", "/home", () => {
							return <HomeScreen />
						}),
						Match.when("/match", () => <GameMatch />),
						Match.exhaustive
					)
				},
				onFailure: (error) => {
					alert(`Error: ${error.message}`)
					if (isInMatch()) {
						setCurrentPath({ path: "/match", pushHistory: false })
					} else {
						setCurrentPath({ path: "/home", pushHistory: false })
					}
					return <>redirecting ...</>
				}
			})}
		</SiteLayout>
	)
}
export default App
