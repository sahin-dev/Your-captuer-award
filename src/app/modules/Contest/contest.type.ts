import z from "zod";
import { RecurringType } from "../../../prismaClient";
import {createContestSchema} from './contest.validation'

export type RecurringData =

{   
    recurrentType: RecurringType;
    previousOccurrence: Date | null; // Previous occurrence can be null for the first occurrence
    nextOccurrence: Date;
    duration: number; // Duration in milliseconds   

}

export type contestData = z.infer<typeof createContestSchema>

export type createContestData = z.infer<typeof createContestSchema>