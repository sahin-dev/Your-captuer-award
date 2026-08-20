import assert from "node:assert/strict";
import test from "node:test";
import { createContestSchema, updateContestSchema } from "./contest.validation";
import { contestRuleInputArraySchema } from "./ContestRules/contestRule.validation";
import {
    contestRuleKeys,
    getContestRuleDefinitionViews,
    LevelRequirementValue,
} from "./ContestRules/contestRule.definitions";
import { getContestLevelForScore } from "./ContestRanking/contestRanking.service";
import { ycLevels } from "../Awards/award.definitions";
import { contestPrizeInputArraySchema } from "../Prize/prize.validation";
import { defaultPrizeDefinitions } from "../Prize/prize.definitions";
import { prizeService } from "../Prize/prize.service";
import prisma from "../../../shared/prisma";

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

    assert.equal(prizeChoices.length, 11);
    assert.ok(prizeChoices.some((prize) => prize.category === "TOP_PHOTO" && prize.type === "TOP_PHOTO"));
    assert.ok(prizeChoices.some((prize) => prize.category === "TOP_PHOTOGRAPHER" && prize.type === "TOP_PHOTOGRAPHER"));
    assert.ok(prizeChoices.some((prize) => prize.category === "WINNER" && prize.type === "WINNER"));

    for (const rankLimit of [10, 20, 50, 100]) {
        assert.ok(prizeChoices.some((prize) => prize.type === "TOP_RANK" && prize.target === "PHOTO" && prize.rankLimit === rankLimit));
        assert.ok(prizeChoices.some((prize) => prize.type === "TOP_RANK" && prize.target === "PHOTOGRAPHER" && prize.rankLimit === rankLimit));
    }
});

test("only Top Photo and Top Photographer are catalog defaults", () => {
    const defaults = defaultPrizeDefinitions
        .filter((definition) => definition.isDefault)
        .map((definition) => definition.category);

    assert.deepEqual(defaults, ["TOP_PHOTO", "TOP_PHOTOGRAPHER"]);
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
