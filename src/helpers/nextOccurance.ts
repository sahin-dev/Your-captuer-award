import { RecurringType } from "../prismaClient";
import { addDays, addMonths, addWeeks } from "date-fns";

export const calculateNextOccurrence = (date:Date, type:RecurringType = RecurringType.DAILY):Date=>{
    switch(type){
        case RecurringType.DAILY:
            return addDays(date, 1)
        case RecurringType.WEEKLY:
            return addWeeks(date, 1)
        case RecurringType.MONTHLY:
            return addMonths(date, 1)
        default:
            return addDays(date, 1)
    }
}

export const calculateNextOccurance = calculateNextOccurrence
