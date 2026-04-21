import { Duration } from "effect"

const duration = Duration.millis(30000)
const serialized = JSON.stringify(duration)
const deserialized = JSON.parse(serialized)
console.log("deserialized:", deserialized)
// returns false because Duration is a class with methods, not a plain object
