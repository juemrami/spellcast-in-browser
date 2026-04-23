import { Context, Data, Effect, pipe, Result, Struct } from "effect"
import { Url } from "effect/unstable/http"
import { Atom } from "effect/unstable/reactivity"

// https://developer.mozilla.org/en-US/docs/Web/API/History
// https://developer.mozilla.org/en-US/docs/Web/API/Location

const normalizeBrowserLocation = (location: globalThis.Location) =>
	pipe(
		Struct.evolve(location, {
			ancestorOrigins: (domStringList) => Array.from(domStringList)
		}),
		Struct.omit(["assign", "reload", "replace"])
	)

type PrefixedPathname = `/${string}`
type PrefixedHash = `#${string}`
class PathNotFound extends Data.TaggedError("PathNotFound")<{
	readonly message: string
	readonly attemptedPath: string
}> {}
export class TypedSpaRouter extends Context.Service<TypedSpaRouter>()(
	"TypedSpaRouter",
	{
		make: Effect.fn(
			function*<
				const Paths extends ReadonlyArray<{ route: PrefixedPathname; aliases: ReadonlyArray<PrefixedPathname> }>
			>(
				options: { paths: Paths }
			) {
				const location = Atom.make((get) => {
					const onLocationChange = () => {
						get.setSelf(normalizeBrowserLocation(window.location))
					}
					window.addEventListener("popstate", onLocationChange)
					window.addEventListener("hashchange", onLocationChange)
					return normalizeBrowserLocation(window.location)
				})
				const url = Atom.writable((get) => {
					return new URL(get(location).href)
				}, (ctx, args: { next: URL; pushHistory: boolean }) => {
					updateHistoryUrl(args.next, args.pushHistory)
					ctx.setSelf(args.next)
				})
				type RegisteredPath = Paths[number]["route"] | Paths[number]["aliases"][number]
				const isRegisteredPath = (pathname: string): pathname is RegisteredPath => {
					return options.paths.some(({ route, aliases }) => {
						return route === pathname || aliases.includes(pathname as PrefixedPathname)
					})
				}
				const validatePath = (pathname: string): Result.Result<RegisteredPath, PathNotFound> => {
					if (!isRegisteredPath(pathname)) {
						return Result.fail(
							new PathNotFound({
								message: `Path \`${pathname}\` not found when loading.`,
								attemptedPath: pathname
							})
						)
					} else {
						return Result.succeed(pathname as RegisteredPath)
					}
				}
				const updateHistoryUrl = (url: URL, push: boolean) => {
					if (push) {
						// https://developer.mozilla.org/en-US/docs/Web/API/History/pushState#url
						window.history.pushState(null, "", url)
					} else {
						window.history.replaceState(null, "", url)
					}
				}

				return {
					pathname: Atom.writable((get) => {
						const pathname = get(url).pathname
						return validatePath(pathname)
					}, (ctx, args: { path: RegisteredPath; pushHistory: boolean }) => {
						const next = Url.mutate(ctx.get(url), (url) => {
							url.pathname = args.path
						})
						ctx.set(url, { ...args, next })
						ctx.setSelf(validatePath(args.path))
					}),
					searchParams: Atom.writable(
						(get) => get(url).searchParams,
						(ctx, args: { params: URLSearchParams; pushHistory: boolean }) => {
							const next = Url.mutate(ctx.get(url), (url) => {
								url.search = args.params.toString()
							})
							ctx.set(url, { ...args, next })
							ctx.setSelf(args.params)
						}
					),
					hash: Atom.writable(
						(get) => get(url).hash as PrefixedHash,
						(ctx, args: { hash: PrefixedHash; pushHistory: boolean }) => {
							const next = Url.mutate(ctx.get(url), (url) => {
								url.hash = args.hash
							})
							ctx.set(url, { ...args, next })
							ctx.setSelf(args.hash)
						}
					),
					mutate: Atom.fnSync((args: {
						mutation: (url: { pathname: RegisteredPath; searchParams: URLSearchParams; hash: PrefixedHash }) => void
						pushHistory: boolean
					}, get) => {
						const next = Url.mutate(get(url), (url) => {
							const mutRef = {
								pathname: url.pathname as RegisteredPath,
								searchParams: url.searchParams,
								hash: url.hash as PrefixedHash
							}
							args.mutation(mutRef)
							url.pathname = mutRef.pathname
							url.search = mutRef.searchParams.toString()
							url.hash = mutRef.hash
						})
						get.set(url, { ...args, next })
					})
				}
			}
		)
	}
) {}
