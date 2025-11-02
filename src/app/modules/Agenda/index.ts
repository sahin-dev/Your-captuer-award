
import agenda from "./jobs"

agenda.on('ready', async () => {
    console.log("Agenda is ready"); 
    agenda.start();
    agenda.every("five minute", "contest:checkRecurring");   
    agenda.every("5 seconds", "contest:active")
});
agenda.on("error", (e) => {
    console.log(e);
});



export default agenda;

