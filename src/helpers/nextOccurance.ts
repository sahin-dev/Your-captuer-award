import { RecurringType } from "../prismaClient";

//Calculate next occurance time of a recurring contest based on recurring type
export const calculateNextOccurance = (date:Date, type:RecurringType = 'DAILY'):Date=>{

    let result = new Date(date);
    
    switch(type){
        case RecurringType.DAILY:
            result.setDate(result.getDate() + 1)
            break
        case RecurringType.WEEKLY:
            result.setDate(result.getDate() + 7)
            break
        case RecurringType.MONTHLY:
            result.setDate(result.getDate() + 30)
            break
        default:
            result.setDate(result.getDate() + 1)

    }

    return result
    
}