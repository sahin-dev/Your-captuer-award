import assert from "node:assert/strict";
import test from "node:test";
import { createContestSchema, updateContestSchema } from "./contest.validation";
import { RecurringType } from "../../../prismaClient";
import { assertValidTimeZone, calculateNextOccurrence } from "../../../helpers/nextOccurance";
import { contestRuleInputArraySchema } from "./ContestRules/contestRule.validation";
import {
    contestRuleKeys,
    getContestRuleDefinitionViews,
    LevelRequirementValue,
} from "./ContestRules/contestRule.definitions";
import { getContestLevelForScore } from "./ContestRanking/contestRanking.service";
import { getRankBandLowerBound, ycLevels } from "../Awards/award.definitions";
import { contestPrizeInputArraySchema } from "../Prize/prize.validation";
import { contestLevelAwardArraySchema } from "./contestLevelAward.validation";
import { defaultPrizeDefinitions } from "../Prize/prize.definitions";
import { prizeService } from "../Prize/prize.service";
import prisma from "../../../shared/prisma";
import { contestRuleService } from "./ContestRules/contestRules.service";

const futureDate = (hours:number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

const baseContest = () => ({
    title:"Urban Stories",
    description:"<p onclick=\"alert(1)\">Street <strong>photography</strong><script>alert(1)</script></p>",
    category:"Street photography",
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

test("recurrence calculation preserves timezone wall-clock time", () => {
    const beforeDst = new Date("2026-03-07T14:00:00.000Z");
    const nextWeekly = calculateNextOccurrence(beforeDst, RecurringType.WEEKLY, "America/New_York");

    assert.equal(nextWeekly.toISOString(), "2026-03-14T13:00:00.000Z");
    assert.throws(() => assertValidTimeZone("Not/A_Timezone"), RangeError);
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

test("contest level scoring keeps users NEW until AMATEUR threshold is reached", () => {
    const requirements:LevelRequirementValue[] = [
        { level:"AMATEUR", votes:50 },
        { level:"TALENTED", votes:250 },
        { level:"SUPREME", votes:900 },
        { level:"SUPERIOR", votes:1900 },
        { level:"TOP_NOTCH", votes:5000 },
    ];

    assert.equal(getContestLevelForScore(0, requirements), ycLevels.NEW);
    assert.equal(getContestLevelForScore(49, requirements), ycLevels.NEW);
    assert.equal(getContestLevelForScore(50, requirements), ycLevels.AMATEUR);
    assert.equal(getContestLevelForScore(250, requirements), ycLevels.TALENTED);
});

test("all contest rule definitions include copyable creation payloads", () => {
    const definitions = getContestRuleDefinitionViews();

    assert.deepEqual(definitions.map((definition) => definition.key), [...contestRuleKeys]);
    definitions.forEach((definition) => {
        assert.deepEqual(definition.payload[definition.key], definition.value);
        assert.ok(["number", "list", "object"].includes(definition.inputType));
        assert.equal("order" in definition, false);
        assert.equal("enabled" in definition, false);
        assert.equal("fields" in definition, false);
    });
});

test("create contest accepts simplified rule definition payloads", () => {
    const parsed = createContestSchema.parse({
        ...baseContest(),
        rules: {
            SUBMISSION_LIMIT: 6,
            SUBMISSION_RULES: [
                "Non-relevant images are not allowed.",
                "AI-generated images are not allowed.",
            ],
            ELIGIBILITY: {
                minAge: 21,
                text: "Open to photographers age 21 and above.",
                requiresAcceptance: true,
            },
            COPYRIGHT: {
                enabled: false,
            },
        },
    });

    const rules = parsed.rules || [];
    assert.equal(rules.find((rule) => rule.key === "SUBMISSION_LIMIT")?.value, 6);
    assert.deepEqual(rules.find((rule) => rule.key === "SUBMISSION_RULES")?.value, [
        "Non-relevant images are not allowed.",
        "AI-generated images are not allowed.",
    ]);
    assert.equal((rules.find((rule) => rule.key === "ELIGIBILITY")?.value as any).minAge, 21);
    assert.equal(rules.find((rule) => rule.key === "COPYRIGHT")?.enabled, false);
});

test("contest rule normalization keeps admin-selected rules without adding UI defaults", () => {
    const selectedRules = contestRuleService.normalizeContestRules([
        {
            key: "SUBMISSION_LIMIT",
            value: 8,
            enabled: true,
            order: 10,
        },
        {
            key: "SUBMISSION_RULES",
            value: ["Only street photography entries."],
            enabled: true,
            order: 20,
        },
    ], false);

    assert.deepEqual(selectedRules.map((rule) => rule.key), [
        "SUBMISSION_LIMIT",
        "SUBMISSION_RULES",
    ]);
    assert.equal(selectedRules.find((rule) => rule.key === "SUBMISSION_LIMIT")?.value, 8);
});

test("contest rule normalization still provides defaults when no rules are submitted", () => {
    const defaultRules = contestRuleService.normalizeContestRules(undefined, true);

    assert.ok(defaultRules.length >= contestRuleKeys.length);
    assert.ok(defaultRules.some((rule) => rule.key === "SUBMISSION_LIMIT"));
});

test("legacy submission rule object payload is normalized to an array of strings", () => {
    const parsed = contestRuleInputArraySchema.parse([{
        key:"SUBMISSION_RULES",
        value:{
            intro:"Do not post:",
            disallowed:["Non-relevant images", "AI images"],
            removalNotice:"Images that do not comply may be removed.",
            duplicatePolicy:"DISALLOW_SAME_PHOTO",
        },
    }]);

    assert.deepEqual(parsed[0].value, [
        "Do not post:",
        "Non-relevant images",
        "AI images",
        "Images that do not comply may be removed.",
    ]);
});

test("simple contest rule payload rejects unsupported rule keys", () => {
    const parsed = createContestSchema.safeParse({
        ...baseContest(),
        rules: {
            UNKNOWN_RULE: true,
        },
    });

    assert.equal(parsed.success, false);
});

test("contest creation accepts prizeIds and simplified prize payload overrides", () => {
    const parsedContest = createContestSchema.parse({
        ...baseContest(),
        prizeIds: JSON.stringify(["66f600000000000000000004"]),
        prizes: JSON.stringify([
            {
                type: "TOP_PHOTO",
                coin: "750",
                boost: "12",
            },
            {
                type: "TOP_RANK",
                target: "PHOTO",
                rankLimit: "10",
                enabled: "false",
                coin: "250",
            },
        ]),
    });
    const parsed = parsedContest.prizes || [];

    assert.deepEqual(parsedContest.prizeIds, ["66f600000000000000000004"]);

    const topPhotoPrize = parsed[0] as any;
    const topRankPrize = parsed[1] as any;

    assert.equal(topPhotoPrize.category, "TOP_PHOTO");
    assert.equal(topPhotoPrize.coin, 750);
    assert.equal(topPhotoPrize.boost, 12);
    assert.equal(topRankPrize.category, "TOP_10_PHOTO");
    assert.equal(topRankPrize.enabled, false);
    assert.equal(topRankPrize.coin, 250);
});

test("legacy award payload aliases still normalize to prize payloads", () => {
    const parsedContest = createContestSchema.parse({
        ...baseContest(),
        awardPrizeIds: JSON.stringify(["66f600000000000000000004"]),
        awards: JSON.stringify([
            {
                type: "TOP_PHOTO",
                coin: "750",
            },
        ]),
    } as any);

    assert.deepEqual(parsedContest.prizeIds, ["66f600000000000000000004"]);
    assert.equal((parsedContest.prizes?.[0] as any).category, "TOP_PHOTO");
    assert.equal((parsedContest.prizes?.[0] as any).coin, 750);
});

test("contest prizes accept simplified definition payload overrides", () => {
    const parsed = contestPrizeInputArraySchema.parse([
        {
            type: "TOP_PHOTO",
            coin: "750",
            boost: "12",
        },
        {
            type: "TOP_RANK",
            target: "PHOTO",
            rankLimit: "10",
            enabled: "false",
            coin: "250",
        },
    ]);

    const topPhotoPrize = parsed[0] as any;
    const topRankPrize = parsed[1] as any;

    assert.equal(topPhotoPrize.category, "TOP_PHOTO");
    assert.equal(topPhotoPrize.coin, 750);
    assert.equal(topPhotoPrize.boost, 12);
    assert.equal(topRankPrize.category, "TOP_10_PHOTO");
    assert.equal(topRankPrize.enabled, false);
    assert.equal(topRankPrize.coin, 250);
});

test("all seeded prize definitions are exposed as contest prize choices", () => {
    const prizeChoices = defaultPrizeDefinitions.map((definition) => ({
        category: definition.category,
        type: definition.type,
        target: definition.target,
        rankLimit: definition.rankLimit,
    }));

    assert.equal(prizeChoices.length, 13);
    assert.ok(prizeChoices.some((prize) => prize.category === "TOP_PHOTO" && prize.type === "TOP_PHOTO"));
    assert.ok(prizeChoices.some((prize) => prize.category === "TOP_PHOTOGRAPHER" && prize.type === "TOP_PHOTOGRAPHER"));
    assert.ok(prizeChoices.some((prize) => prize.category === "WINNER" && prize.type === "WINNER"));

    for (const rankLimit of [10, 20, 50, 100, 200]) {
        assert.ok(prizeChoices.some((prize) => prize.type === "TOP_RANK" && prize.target === "PHOTO" && prize.rankLimit === rankLimit));
        assert.ok(prizeChoices.some((prize) => prize.type === "TOP_RANK" && prize.target === "PHOTOGRAPHER" && prize.rankLimit === rankLimit));
    }
});

test("rank tier bands are exclusive, not cumulative, so a rank-3 photo only wins Top 10 and not also Top 20/50/100/200", () => {
    assert.equal(getRankBandLowerBound(10), 2, "Top 10 excludes rank 1, which belongs to the standalone Top Photo award");
    assert.equal(getRankBandLowerBound(20), 11, "Top 20 starts right after Top 10 ends");
    assert.equal(getRankBandLowerBound(50), 21, "Top 50 starts right after Top 20 ends");
    assert.equal(getRankBandLowerBound(100), 51, "Top 100 starts right after Top 50 ends");
    assert.equal(getRankBandLowerBound(200), 101, "Top 200 starts right after Top 100 ends");

    const bandFor = (rank: number) => {
        for (const rankLimit of [10, 20, 50, 100, 200]) {
            if (rank >= getRankBandLowerBound(rankLimit) && rank <= rankLimit) {
                return rankLimit;
            }
        }
        return null;
    };

    assert.equal(bandFor(1), null, "rank 1 belongs to Top Photo, not a tier band");
    assert.equal(bandFor(2), 10);
    assert.equal(bandFor(10), 10);
    assert.equal(bandFor(11), 20);
    assert.equal(bandFor(20), 20);
    assert.equal(bandFor(21), 50);
    assert.equal(bandFor(50), 50);
    assert.equal(bandFor(51), 100);
    assert.equal(bandFor(100), 100);
    assert.equal(bandFor(101), 200);
    assert.equal(bandFor(200), 200);
    assert.equal(bandFor(201), null, "ranks beyond 200 don't qualify for any tier");
});

test("Top Photo, Top Photographer, and every rank tier are catalog defaults so awards are always automatic", () => {
    const defaults = defaultPrizeDefinitions
        .filter((definition) => definition.isDefault)
        .map((definition) => definition.category);

    assert.deepEqual(defaults, [
        "TOP_PHOTO",
        "TOP_PHOTOGRAPHER",
        "TOP_10_PHOTO",
        "TOP_10_PHOTOGRAPHER",
        "TOP_20_PHOTO",
        "TOP_20_PHOTOGRAPHER",
        "TOP_50_PHOTO",
        "TOP_50_PHOTOGRAPHER",
        "TOP_100_PHOTO",
        "TOP_100_PHOTOGRAPHER",
        "TOP_200_PHOTO",
        "TOP_200_PHOTOGRAPHER",
    ]);
    assert.ok(!defaults.includes("WINNER"));
});

test("contest prize definitions skip malformed prize rows instead of crashing the UI", async () => {
    const originalFindMany = prisma.prize.findMany as any;

    (prisma.prize as any).findMany = async () => [
        {
            id: "bad-top-rank",
            category: "TOP_PHOTO",
            type: "TOP_PHOTO",
            target: "PHOTOGRAPHER",
            rankLimit: null,
            title: "Invalid top rank",
            description: "Broken data",
            boost: 0,
            swap: 0,
            key: 0,
            coin: 0,
            isDefault: false,
            isActive: true,
            order: 1,
        },
        {
            id: "valid-prize",
            category: "TOP_PHOTO",
            type: "TOP_PHOTO",
            target: "PHOTO",
            rankLimit: null,
            title: "Top Photo",
            description: "Awarded to the highest-ranked photo",
            boost: 10,
            swap: 1,
            key: 1,
            coin: 500,
            isDefault: true,
            isActive: true,
            order: 10,
        },
    ] as any;

    try {
        const definitions = await prizeService.getContestPrizeDefinitions();
        assert.equal(definitions.length, 1);
        assert.equal(definitions[0].prizeId, "valid-prize");
    } finally {
        (prisma.prize as any).findMany = originalFindMany;
    }
});

test("contest updates cannot bypass the writable-field contract", () => {
    const parsed = updateContestSchema.parse({
        title:" Updated title ",
        description:"<p onmouseover=\"alert(1)\">Updated</p>",
        category:"Nature",
    });
    assert.equal(parsed.title, "Updated title");
    assert.equal(parsed.category, "Nature");
    assert.doesNotMatch(parsed.description || "", /onmouseover/);

    const statusUpdate = updateContestSchema.safeParse({status:"ACTIVE"});
    assert.equal(statusUpdate.success, false);

    const categoryIdUpdate = updateContestSchema.safeParse({categoryId:"674b00000000000000000001"});
    assert.equal(categoryIdUpdate.success, false);
});

test("contest level awards are optional but all-or-nothing across the 5 levels", () => {
    const disabled = contestLevelAwardArraySchema.safeParse([]);
    assert.equal(disabled.success, true, "an empty array (feature off) is valid");

    const partial = contestLevelAwardArraySchema.safeParse([
        { level: "AMATEUR", boost: 1, swap: 0, key: 0, coin: 10 },
        { level: "TALENTED", boost: 2, swap: 0, key: 0, coin: 20 },
    ]);
    assert.equal(partial.success, false, "configuring only some levels must be rejected");

    const duplicate = contestLevelAwardArraySchema.safeParse([
        { level: "AMATEUR", boost: 1, swap: 0, key: 0, coin: 10 },
        { level: "AMATEUR", boost: 2, swap: 0, key: 0, coin: 20 },
        { level: "TALENTED", boost: 0, swap: 0, key: 0, coin: 0 },
        { level: "SUPREME", boost: 0, swap: 0, key: 0, coin: 0 },
        { level: "SUPERIOR", boost: 0, swap: 0, key: 0, coin: 0 },
    ]);
    assert.equal(duplicate.success, false, "duplicate levels must be rejected");

    const complete = contestLevelAwardArraySchema.safeParse([
        { level: "AMATEUR", boost: 1, swap: 0, key: 0, coin: 10 },
        { level: "TALENTED", boost: 2, swap: 0, key: 1, coin: 20 },
        { level: "SUPREME", boost: 3, swap: 1, key: 1, coin: 40 },
        { level: "SUPERIOR", boost: 4, swap: 1, key: 2, coin: 80 },
        { level: "TOP_NOTCH", boost: 5, swap: 2, key: 3, coin: 150 },
    ]);
    assert.equal(complete.success, true, "all 5 levels configured together is valid");

    const createWithLevelAwards = createContestSchema.safeParse({
        title: "Level award contest",
        description: "A".repeat(30),
        category: "nature",
        startDate: futureDate(1),
        endDate: futureDate(25),
        levelAwards: JSON.stringify([
            { level: "AMATEUR", boost: 1, swap: 0, key: 0, coin: 10 },
        ]),
    });
    assert.equal(createWithLevelAwards.success, false, "createContestSchema must enforce the same all-or-nothing rule");
});
