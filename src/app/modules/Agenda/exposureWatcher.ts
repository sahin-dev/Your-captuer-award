import agenda from "./";

export const createExposureWatcher = async (contestPhotoId: string) => {
    return agenda.every("30 minutes", "exposure:watcher", {contestPhotoId:String(contestPhotoId)})
};
