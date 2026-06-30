import agenda from "./";

export const createExposureWatcher = async (participantId: string) => {
    const exposureJob = agenda.create("exposure:watcher", { contestParticipantId: participantId });
    exposureJob.unique({ 'data.contestParticipantId': participantId });
    exposureJob.repeatEvery("1 minute");
    await exposureJob.save();
};
