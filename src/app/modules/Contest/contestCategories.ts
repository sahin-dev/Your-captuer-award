import { z } from "zod";
import { dedupeLabels } from "../../../shared/labels";

// A contest can belong to several categories. `categories` is the source of
// truth; the legacy single `category` column is kept equal to categories[0] so
// older clients (and any code still reading `category`) keep working.
export const MAX_CONTEST_CATEGORIES = 10;
export const MAX_CONTEST_CATEGORY_LENGTH = 100;

// Multipart bodies send arrays as a JSON string ('["a","b"]'), repeated fields
// (an array) or a single plain value ("a"). Normalize all of them to string[].
const parseCategoriesValue = (value: unknown) => {
    if (value === undefined || value === null) {
        return value;
    }
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") {
            return [];
        }
        if (trimmed.startsWith("[")) {
            try {
                return JSON.parse(trimmed);
            } catch {
                return value;
            }
        }
        return [trimmed];
    }
    return value;
};

export const contestCategoriesField = z.preprocess(
    parseCategoriesValue,
    z.array(z.string().trim().max(MAX_CONTEST_CATEGORY_LENGTH))
        .transform((categories) => dedupeLabels(categories.filter((category) => category.length > 0)))
        .refine((categories) => categories.length <= MAX_CONTEST_CATEGORIES, {
            message: `A contest can have at most ${MAX_CONTEST_CATEGORIES} categories`,
        })
).optional();

export const contestCategoryField = z.string().trim().min(1).max(MAX_CONTEST_CATEGORY_LENGTH).optional();

// Resolves the {category, categories} pair to persist from a request that may
// carry the new `categories` list, the legacy `category` string, or both.
// Returns undefined when neither was sent, so updates leave the stored value alone.
export const resolveCategoryInput = (input: { category?: string | null; categories?: string[] | null }) => {
    if (input.categories !== undefined && input.categories !== null) {
        const categories = dedupeLabels([
            ...input.categories,
            ...(input.category ? [input.category] : []),
        ].map((category) => category.trim()).filter(Boolean));
        return { category: categories[0] ?? null, categories };
    }
    const legacy = input.category?.trim();
    if (legacy) {
        return { category: legacy, categories: [legacy] };
    }
    return undefined;
};

// Reads the categories of a stored contest, falling back to the legacy single
// category for documents written before multi-category support existed.
export const getStoredCategories = (contest: { category?: string | null; categories?: string[] | null }) => {
    if (contest.categories && contest.categories.length > 0) {
        return contest.categories;
    }
    const legacy = contest.category?.trim();
    return legacy ? [legacy] : [];
};
