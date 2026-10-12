import { Prisma } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import logger from "../../../shared/logger";
import { dedupeLabels, labelKey } from "../../../shared/labels";

// The contest_categories collection doubles as the admin's suggestion list
// (served by GET /contests/create-options). Every category saved on a contest
// or recurring template is matched against it ignoring case - so "street" and
// "Street" stay one category - and any category not in it yet is added.

// Order for categories added from contests: after the seeded ones (10-80),
// alphabetical among themselves (create-options sorts by order, then name).
const REGISTERED_CATEGORY_ORDER = 1000;

type ContestCategoryDb = {
    contestCategory:{
        findMany:(args:any) => Promise<Array<{name:string; slug:string}>>
        create:(args:any) => Promise<unknown>
    }
}

export const slugifyCategory = (name:string) =>
    name
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    // Names made only of symbols/non-latin text still need a stable, unique slug.
    || `category-${Buffer.from(labelKey(name)).toString("hex").slice(0, 40)}`;

// Returns the categories using the spelling already in the suggestion list and
// adds the ones that are missing. Shared with the seeder backfill, which uses
// its own Prisma client.
export const registerContestCategoryNames = async (db:ContestCategoryDb, rawNames:string[]) => {
    const names = dedupeLabels(rawNames.map(name => name.trim()).filter(Boolean));
    if(names.length === 0){
        return []
    }

    const existing = await db.contestCategory.findMany({select:{name:true, slug:true}});
    const byName = new Map(existing.map(category => [labelKey(category.name), category.name]));
    const bySlug = new Map(existing.map(category => [category.slug, category.name]));

    const canonical:string[] = [];
    for(const name of names){
        const slug = slugifyCategory(name);
        const known = byName.get(labelKey(name)) ?? bySlug.get(slug);
        if(known){
            canonical.push(known);
            continue;
        }

        try{
            await db.contestCategory.create({
                data:{name, slug, order:REGISTERED_CATEGORY_ORDER, isActive:true}
            });
        }catch(error){
            // Another request registered the same category concurrently - fine.
            if(!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")){
                throw error;
            }
        }
        byName.set(labelKey(name), name);
        bySlug.set(slug, name);
        canonical.push(name);
    }

    return dedupeLabels(canonical);
};

// Applies registerContestCategoryNames to a resolved {category, categories}
// update. Suggestions are a convenience: if registering fails, the contest is
// still saved with the categories exactly as entered.
const prepareCategoryUpdate = async <T extends {category:string | null; categories:string[]} | undefined>(update:T):Promise<T> => {
    if(!update || update.categories.length === 0){
        return update;
    }
    try{
        const categories = await registerContestCategoryNames(prisma, update.categories);
        return {...update, category:categories[0] ?? null, categories} as T;
    }catch(error){
        logger.error({ err: error, categories: update.categories }, "Failed to register contest categories");
        return update;
    }
};

export const contestCategoryService = {
    prepareCategoryUpdate,
};
