import { RecurringType } from "../../../prismaClient";

export interface IContest {
    title: string;    
    description: string;
    categoryId?: string | null;
    recurring: boolean;
    recurring_status?: boolean;
    recurringType?: RecurringType;
    startDate: string; // ISO date string
    endDate: string; // ISO date string 
    banner?: string; // Optional file upload
    isMoneyContest?: boolean; // Optional, default to false
    maxPrize?: number; // Optional, default to 0
    minPrize?: number; // Optional, default to 0
    currency?: string | null;
    entryFeeCoins?: number;
    
}
