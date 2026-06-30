import agenda from "./";

export const createExposureWatcher = async (participantId: string) => {
    const participantIdString = String(participantId)
    const exposureJob = agenda.create("exposure:watcher", { contestParticipantId: participantIdString });
    exposureJob.unique({ 'data.contestParticipantId': participantIdString });
    exposureJob.repeatEvery("1 minute");
    await exposureJob.save();
};
