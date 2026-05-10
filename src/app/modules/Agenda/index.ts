
import agenda from "./jobs"

agenda.on('ready', async () => {
    console.log("Agenda is ready"); 
    
    agenda.every("five minute", "contest:checkRecurring");   
    agenda.every("1 minute", "contest:active")
    await agenda.start();
});
agenda.on("error", (e) => {
    console.log(e);
});



export default agenda;

