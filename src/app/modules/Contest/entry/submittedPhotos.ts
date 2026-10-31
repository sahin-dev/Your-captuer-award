import { fileUploader } from "../../../../helpers/fileUploader";
import { dedupeLabels, hasLabel } from "../../../../shared/labels";
import logger from "../../../../shared/logger";
import prisma, { PrismaTx } from "../../../../shared/prisma";
import { getStoredCategories } from "../contestCategories";

export type CreatedPhoto = { userPhotoId: string; file: Express.Multer.File };

// Undoes the profile-pool photos a rejected contest submission created, so a
// failed entry never leaves a stray photo in the user's gallery or a stray
// object in storage. Photos the user picked from their existing pool are not
// passed here and are never removed.
export const rollbackUploadedContestPhotos = async (created:CreatedPhoto[]) => {
    if(created.length === 0){
        return
    }
    try{
        await prisma.userPhoto.deleteMany({where:{id:{in:created.map(item => item.userPhotoId)}}})
    }catch(error){
        logger.error({ err: error }, "Failed to roll back contest submission photos")
        return
    }
    await Promise.all(created.map(async ({file}) => {
        file.claimed = false
        await fileUploader.discardUploadedFile(file)
    }))
}

// Adds a contest category to each submitted photo. The conditional update is
// important: two requests may submit the same gallery photo at nearly the same
// time, and a read-then-push alone could append the same category twice.
const addContestCategoryToPhotos = async (tx:PrismaTx, photoIds:string[], rawCategory:string | null) => {
    const category = rawCategory?.trim()
    if(!category || photoIds.length === 0){
        return
    }

    const photos = await tx.userPhoto.findMany({
        where:{id:{in:photoIds}},
        select:{id:true, categories:true}
    })

    await Promise.all(photos.map(async photo => {
        const uniqueCategories = dedupeLabels(photo.categories)

        // Clean up any legacy duplicates while preserving the first spelling,
        // and include the new category in the same write when it is missing.
        if(uniqueCategories.length !== photo.categories.length){
            await tx.userPhoto.update({
                where:{id:photo.id},
                data:{categories:{
                    set:hasLabel(uniqueCategories, category)
                        ? uniqueCategories
                        : [...uniqueCategories, category]
                }}
            })
            return
        }

        if(hasLabel(uniqueCategories, category)){
            return
        }

        // The exact `has` guard makes same-category concurrent additions atomic
        // for current rows where the array field exists.
        const added = await tx.userPhoto.updateMany({
            where:{
                id:photo.id,
                NOT:{categories:{has:category}}
            },
            data:{categories:{push:category}}
        })

        // Mongo list filters do not match documents created before the field
        // existed. Prisma reads those as [], so initialize that legacy row with
        // a deduplicated list when the guarded push could not match it.
        if(added.count === 0){
            await tx.userPhoto.update({
                where:{id:photo.id},
                data:{categories:{set:[...uniqueCategories, category]}}
            })
        }
    }))
}

// Adds every category of the contest to each submitted photo.
export const addContestCategoriesToPhotos = async (
    tx:PrismaTx,
    photoIds:string[],
    contest:{category?:string | null; categories?:string[] | null}
) => {
    // Sequential on purpose: each call reads the current list before writing.
    for(const category of getStoredCategories(contest)){
        await addContestCategoryToPhotos(tx, photoIds, category)
    }
}
