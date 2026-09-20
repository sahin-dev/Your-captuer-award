import { Agenda } from "agenda";
import { initAgenda } from "./init";
import { registerAgendaJobs } from "./jobs";
import { registerJobRetries } from "./retry";

let agenda:Agenda | null = null;
let started = false;
let starting:Promise<Agenda> | null = null;

const getAgenda = () => {
    if(!agenda){
        agenda = initAgenda();
        registerAgendaJobs(agenda);
        registerJobRetries(agenda);
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
    if(starting){
        return starting;
    }

    const scheduler = getAgenda();
    starting = (async () => {
        console.log("Starting agenda scheduler");
        await scheduler.start();
        await scheduler.every("five minute", "contest:checkRecurring");
        await scheduler.every("5 seconds", "contest:active");
        await scheduler.every("30 seconds", "contest:watchEnded");
        await scheduler.every("1 minute", "contest:decayExposure");
        await scheduler.every("1 minute", "promotion:sweep");
        await scheduler.every("1 minute", "teamMatch:watchStale");
        await scheduler.every("1 minute", "teamMatch:watchQueueTimeouts");
        await scheduler.every("0 9 * * 0", "team:weeklyPayout");
        await scheduler.every("0 9 1 * *", "team:monthlyPayout");
        await scheduler.every("0 9 1 1 *", "team:yearlyPayout");
        started = true;
        console.log("Agenda scheduler started");
        return scheduler;
    })();

    try {
        return await starting;
    } catch (error) {
        await scheduler.stop().catch(() => undefined);
        throw error;
    } finally {
        starting = null;
    }
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
