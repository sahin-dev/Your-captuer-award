import z from "zod";

export const MAX_PHOTO_LABELS = 20
export const MAX_PHOTO_LABEL_LENGTH = 30
const MAX_DIRECT_PHOTO_SIZE = 150 * 1024 * 1024

// The file bytes never pass through this API for direct uploads. These schemas
// validate the metadata used to sign the PUT and the key sent back after the
// browser has completed it.
const createDirectUploadUrlSchema = z.object({
    fileName:z.string().trim().max(255).optional(),
    contentType:z.string().trim().min(1),
    fileSize:z.coerce.number().int().positive().max(MAX_DIRECT_PHOTO_SIZE)
})

const confirmDirectUploadSchema = z.object({
    key:z.string().trim().min(1).max(512)
})

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

export const profileSchema = {
    updatePhotoLabelsSchema,
    createDirectUploadUrlSchema,
    confirmDirectUploadSchema
}
