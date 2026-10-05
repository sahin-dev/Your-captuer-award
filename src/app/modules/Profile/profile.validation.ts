import z from "zod";

export const MAX_PHOTO_LABELS = 20
export const MAX_PHOTO_LABEL_LENGTH = 30
export const MAX_PHOTO_CATEGORIES = 20
export const MAX_PHOTO_CATEGORY_LENGTH = 100

// The owner sends the full list of labels the photo should have. Labels are
// trimmed and blank ones dropped here; repeated labels are removed in the
// service with the shared, case-insensitive dedupeLabels.
const updatePhotoLabelsSchema = z.object({
    labels:z.array(
        z.string().trim().max(MAX_PHOTO_LABEL_LENGTH, {message:`a label can be at most ${MAX_PHOTO_LABEL_LENGTH} characters`})
    )
    .transform(labels => labels.filter(label => label.length > 0))
    .refine(labels => labels.length <= MAX_PHOTO_LABELS, {message:`a photo can have at most ${MAX_PHOTO_LABELS} labels`})
})

// Categories use the same replace-the-whole-list contract as labels. Contest
// names may be longer than user tags, so they retain the contest field's
// 100-character limit.
const updatePhotoCategoriesSchema = z.object({
    categories:z.array(
        z.string().trim().max(MAX_PHOTO_CATEGORY_LENGTH, {message:`a category can be at most ${MAX_PHOTO_CATEGORY_LENGTH} characters`})
    )
    .transform(categories => categories.filter(category => category.length > 0))
    .refine(categories => categories.length <= MAX_PHOTO_CATEGORIES, {message:`a photo can have at most ${MAX_PHOTO_CATEGORIES} categories`})
})

export const profileSchema = {
    updatePhotoLabelsSchema,
    updatePhotoCategoriesSchema
}
