import z from "zod";

export const MAX_PHOTO_LABELS = 20
export const MAX_PHOTO_LABEL_LENGTH = 30

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
    updatePhotoLabelsSchema
}
