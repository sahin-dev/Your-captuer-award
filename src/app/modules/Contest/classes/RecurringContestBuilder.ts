
import { RecurringContest, RecurringType } from "../../../../prismaClient"
import { AbstractContestBuilder } from "./AbstractContestBuilder"

export class RecurringContestBuilder extends AbstractContestBuilder {

    recurrence (recurringType:RecurringType){
        
        let rData = {
                    recurringType:recurringType,
                    previousOccurrence:null,
                    nextOccurrence:new Date(this.contest.startDate),
                    duration:new Date(this.contest.endDate).getTime() - new Date(this.contest.startDate).getTime()
                }
        this.contest.recurring = rData
    }

    build ():RecurringContest{
        return {...this.contest}
    }

}