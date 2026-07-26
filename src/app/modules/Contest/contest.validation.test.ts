import assert from "node:assert/strict";
import test from "node:test";
import { createContestSchema, updateContestSchema } from "./contest.validation";
import { contestRuleInputArraySchema } from "./ContestRules/contestRule.validation";
import { defaultPrizeDefinitions } from "../Prize/prize.definitions";

const futureDate = (hours:number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

const baseContest = () => ({
    title:"Urban Stories",
    description:"<p onclick=\"alert(1)\">Street <strong>photography</strong><script>alert(1)</script></p>",
    startDate:futureDate(2),
    endDate:futureDate(4),
    isMoneyContest:false,
});

test("create contest accepts multipart-style values and sanitizes rich text", () => {
    const parsed = createContestSchema.parse({
        ...baseContest(),
        recurring:"false",
        coinRequirement:"false",
        entryFeeCoins:"0",
    });

    assert.equal(parsed.recurring, false);
    assert.equal(parsed.entryFeeCoins, 0);
    assert.match(parsed.description, /<strong>photography<\/strong>/);
    assert.doesNotMatch(parsed.description, /script|onclick/);
});

test("money contests require bounded values and currency", () => {
    const missingCurrency = createContestSchema.safeParse({
        ...baseContest(),
        isMoneyContest:true,
        minPrize:100,
        maxPrize:500,
    });
    assert.equal(missingCurrency.success, false);

    const valid = createContestSchema.parse({
        ...baseContest(),
        isMoneyContest:true,
        currency:"usd",
        minPrize:"100",
        maxPrize:"500",
    });
    assert.equal(valid.currency, "USD");
});

test("coin requirement needs a positive entry fee", () => {
    const parsed = createContestSchema.safeParse({
        ...baseContest(),
        coinRequirement:true,
        entryFeeCoins:0,
    });
    assert.equal(parsed.success, false);
});

test("recurrence accepts timezone and termination settings", () => {
    const parsed = createContestSchema.parse({
        ...baseContest(),
        recurring:true,
        recurrence:JSON.stringify({
            type:"WEEKLY",
            timezone:"Asia/Dhaka",
            maxOccurrences:12,
        }),
    });

    assert.equal(parsed.recurrence?.type, "WEEKLY");
    assert.equal(parsed.recurrence?.maxOccurrences, 12);
});

test("submission formats are restricted to formats the runtime supports", () => {
    const accepted = contestRuleInputArraySchema.safeParse([{
        key:"SUBMISSION_FORMAT",
        value:{
            mimeTypes:["image/jpeg", "image/webp", "image/heic", "image/tiff"],
            minWidth:700,
            minHeight:700,
            maxSizeMB:25,
        },
    }]);
    assert.equal(accepted.success, true);

    const rejected = contestRuleInputArraySchema.safeParse([{
        key:"SUBMISSION_FORMAT",
        value:{
            mimeTypes:["application/pdf"],
            minWidth:700,
            minHeight:700,
            maxSizeMB:25,
        },
    }]);
    assert.equal(rejected.success, false);
});

test("only Top Photo and Top Photographer are catalog defaults", () => {
    const defaults = defaultPrizeDefinitions
        .filter((definition) => definition.isDefault)
        .map((definition) => definition.category);

    assert.deepEqual(defaults, ["TOP_PHOTO", "TOP_PHOTOGRAPHER"]);
});

test("contest updates cannot bypass the writable-field contract", () => {
    const parsed = updateContestSchema.parse({
        title:" Updated title ",
        description:"<p onmouseover=\"alert(1)\">Updated</p>",
    });
    assert.equal(parsed.title, "Updated title");
    assert.doesNotMatch(parsed.description || "", /onmouseover/);

    const statusUpdate = updateContestSchema.safeParse({status:"ACTIVE"});
    assert.equal(statusUpdate.success, false);
});
