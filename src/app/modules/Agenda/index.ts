import { Agenda } from "agenda";
import { initAgenda } from "./init";
import { registerAgendaJobs } from "./jobs";

let agenda:Agenda | null = null;
let started = false;

const getAgenda = () => {
    if(!agenda){
        agenda = initAgenda();
        registerAgendaJobs(agenda);
        agenda.on("error", (e) => {
            console.log("Agenda error:", e);
        });
    }

    return agenda;
}

export const startAgenda = async () => {
    if(started){
        return getAgenda();
    }

    started = true;
    const scheduler = getAgenda();

    console.log("Starting agenda scheduler");
    await scheduler.start();
    await scheduler.every("five minute", "contest:checkRecurring");
    await scheduler.every("5 seconds", "contest:active");
    await scheduler.every("30 seconds", "contest:watchEnded");
    await scheduler.every("1 minute", "teamMatch:watchStale");
    console.log("Agenda scheduler started");

    return scheduler;
}

type AgendaFacade = {
    schedule: (...args:any[]) => Promise<any>;
    every: (...args:any[]) => Promise<any>;
    cancel: (...args:any[]) => Promise<any>;
    stop: () => Promise<any>;
}

const agendaFacade:AgendaFacade = {
    schedule: (...args:any[]) => (getAgenda().schedule as any)(...args),
    every: (...args:any[]) => (getAgenda().every as any)(...args),
    cancel: (...args:any[]) => (getAgenda().cancel as any)(...args),
    stop: async () => agenda ? agenda.stop() : undefined
}

export default agendaFacade;
