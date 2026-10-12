import assert from "node:assert/strict";
import test from "node:test";
import { getStoredCategories, MAX_CONTEST_CATEGORIES, resolveCategoryInput } from "./contestCategories";
import { createContestSchema, updateContestSchema } from "./contest.validation";
import { updateRecurringContestSchema } from "../RecurringContest/recurringContest.validation";

const futureDate = (hours:number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

const baseContest = () => ({
    title:"Urban Stories",
    description:"<p>Street photography</p>",
    startDate:futureDate(2),
    endDate:futureDate(4),
});

test("create contest accepts categories as a multipart JSON string", () => {
    const parsed = createContestSchema.parse({...baseContest(), categories:'["Street", "Night", "street"]'});
    assert.deepEqual(parsed.categories, ["Street", "Night"]);
});

test("create contest accepts categories as an array and as a single plain value", () => {
    assert.deepEqual(createContestSchema.parse({...baseContest(), categories:[" Street ", ""]}).categories, ["Street"]);
    assert.deepEqual(createContestSchema.parse({...baseContest(), categories:"Street"}).categories, ["Street"]);
});

test("create contest still accepts the legacy single category", () => {
    const parsed = createContestSchema.parse({...baseContest(), category:"Street"});
    assert.equal(parsed.category, "Street");
    assert.equal(parsed.categories, undefined);
});

test("create contest rejects too many categories", () => {
    const categories = Array.from({length:MAX_CONTEST_CATEGORIES + 1}, (_, index) => `Category ${index}`);
    assert.throws(() => createContestSchema.parse({...baseContest(), categories}));
});

test("update contest (strict schema) accepts categories, including an empty list", () => {
    assert.deepEqual(updateContestSchema.parse({categories:'["A","B"]'}).categories, ["A", "B"]);
    assert.deepEqual(updateContestSchema.parse({categories:"[]"}).categories, []);
});

test("resolveCategoryInput keeps category equal to the first category", () => {
    assert.deepEqual(resolveCategoryInput({categories:["Street", "Night"]}), {category:"Street", categories:["Street", "Night"]});
    assert.deepEqual(resolveCategoryInput({category:"Street"}), {category:"Street", categories:["Street"]});
    assert.deepEqual(resolveCategoryInput({category:"Night", categories:["Street", "night"]}), {category:"Street", categories:["Street", "night"]});
    assert.deepEqual(resolveCategoryInput({categories:[]}), {category:null, categories:[]});
    assert.equal(resolveCategoryInput({}), undefined);
});

test("getStoredCategories falls back to the legacy category for old documents", () => {
    assert.deepEqual(getStoredCategories({category:"Street", categories:[]}), ["Street"]);
    assert.deepEqual(getStoredCategories({category:"Street"}), ["Street"]);
    assert.deepEqual(getStoredCategories({category:"Street", categories:["Night", "Street"]}), ["Night", "Street"]);
    assert.deepEqual(getStoredCategories({category:null, categories:[]}), []);
});

test("recurring template update accepts multipart string values", () => {
    const parsed = updateRecurringContestSchema.parse({
        title:"Daily Street",
        categories:'["Street","Night"]',
        isMoneyContest:"false",
        currency:"",
        minPrize:"0",
        maxPrize:"",
        entryFeeAmount:"0",
        entryFeeCoins:"5",
        applyToUpcoming:"true",
        bannerUserPhotoId:"507f1f77bcf86cd799439011",
    });
    assert.deepEqual(parsed.categories, ["Street", "Night"]);
    assert.equal(parsed.isMoneyContest, false);
    assert.equal(parsed.currency, null);
    assert.equal(parsed.minPrize, 0);
    assert.equal(parsed.maxPrize, undefined);
    assert.equal(parsed.entryFeeCoins, 5);
    assert.equal(parsed.applyToUpcoming, true);
});

test("recurring template update still accepts the existing JSON body", () => {
    const parsed = updateRecurringContestSchema.parse({
        title:"Daily Street",
        category:"Street",
        isMoneyContest:true,
        minPrize:10,
        maxPrize:20,
        currency:"usd",
        entryFeeAmount:0,
        entryFeeCoins:0,
    });
    assert.equal(parsed.category, "Street");
    assert.equal(parsed.isMoneyContest, true);
    assert.equal(parsed.currency, "USD");
    assert.equal(parsed.applyToUpcoming, undefined);
});

test("recurring template update rejects an invalid banner photo id", () => {
    assert.throws(() => updateRecurringContestSchema.parse({bannerUserPhotoId:"not-an-id"}));
});
