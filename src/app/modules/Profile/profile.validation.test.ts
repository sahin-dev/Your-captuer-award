import assert from "node:assert/strict";
import test from "node:test";
import { profileSchema } from "./profile.validation";

test("photo category input trims values and drops blanks", () => {
    const parsed = profileSchema.updatePhotoCategoriesSchema.parse({
        categories:["  Nature  ", "", "   ", "Portrait"]
    })

    assert.deepEqual(parsed.categories, ["Nature", "Portrait"])
})

test("photo category input rejects overlong values", () => {
    const parsed = profileSchema.updatePhotoCategoriesSchema.safeParse({
        categories:["x".repeat(101)]
    })

    assert.equal(parsed.success, false)
})
