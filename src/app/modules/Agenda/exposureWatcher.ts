import agenda from "./";

export const createExposureWatcher = async (contestPhotoId: string) => {
    return agenda.every("1 minute", "exposure:watcher", {contestPhotoId:String(contestPhotoId)})
};
