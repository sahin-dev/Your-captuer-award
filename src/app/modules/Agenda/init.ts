import Agenda from "agenda";
import config from "../../../config";


const mongodbUrl = config.db || "";

 function initAgenda() {
    if (!mongodbUrl) {  
        throw new Error("Database URL is not defined in the configuration.");
    }
    
    const agenda = new Agenda({
        db: { address: mongodbUrl, collection: "agendaJobs" }
    });
    return agenda;
}

const agenda = initAgenda();

export default agenda;