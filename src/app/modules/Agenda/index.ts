import Agenda from "agenda";
import config from "../../../config";
import prisma from "../../../shared/prisma";
import agenda from "./jobs"

agenda.on('ready', async () => {
    console.log("Agenda is ready"); 
    agenda.start();
    agenda.every("one minute", "contest:checkRecurring");   
});
agenda.on("stop", () => {
    console.log("Agenda has stopped");
});



export default agenda;

