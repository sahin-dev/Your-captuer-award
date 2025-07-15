import { RecurringType } from "@prisma/client";

export type RecurringData =

{   
    recurrentType: RecurringType;
    previousOccurrence: Date | null; // Previous occurrence can be null for the first occurrence
    nextOccurrence: Date;
    duration: number; // Duration in milliseconds   

}