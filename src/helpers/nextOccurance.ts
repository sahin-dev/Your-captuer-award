import { RecurringType } from "../prismaClient";
import { addDays, addMonths, addWeeks } from "date-fns";

type ZonedDateParts = {
    year:number;
    month:number;
    day:number;
    hour:number;
    minute:number;
    second:number;
    millisecond:number;
}

const getDateTimeFormat = (timeZone:string) => new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12:false,
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
    hour:"2-digit",
    minute:"2-digit",
    second:"2-digit",
});

export const assertValidTimeZone = (timeZone?:string | null) => {
    if(!timeZone){
        return;
    }

    try{
        getDateTimeFormat(timeZone).format(new Date());
    }catch{
        throw new RangeError(`Invalid timezone: ${timeZone}`);
    }
}

const getZonedParts = (date:Date, timeZone:string):ZonedDateParts => {
    const parts = getDateTimeFormat(timeZone).formatToParts(date);
    const values = Object.fromEntries(
        parts
            .filter(part => part.type !== "literal")
            .map(part => [part.type, Number(part.value)])
    ) as Record<string, number>;

    return {
        year:values.year,
        month:values.month,
        day:values.day,
        hour:values.hour === 24 ? 0 : values.hour,
        minute:values.minute,
        second:values.second,
        millisecond:date.getUTCMilliseconds(),
    };
}

const getTimeZoneOffsetMs = (date:Date, timeZone:string) => {
    const parts = getZonedParts(date, timeZone);
    const zonedAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
        parts.millisecond
    );

    return zonedAsUtc - date.getTime();
}

const zonedPartsToDate = (parts:ZonedDateParts, timeZone:string) => {
    const utcWallTime = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
        parts.millisecond
    );

    let result = new Date(utcWallTime - getTimeZoneOffsetMs(new Date(utcWallTime), timeZone));
    result = new Date(utcWallTime - getTimeZoneOffsetMs(result, timeZone));

    return result;
}

const addRecurringInterval = (date:Date, type:RecurringType) => {
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

export const calculateNextOccurrence = (
    date:Date,
    type:RecurringType = RecurringType.DAILY,
    timeZone?:string | null
):Date=>{
    if(!timeZone){
        return addRecurringInterval(date, type)
    }

    assertValidTimeZone(timeZone);

    const parts = getZonedParts(date, timeZone);
    const wallClockDate = new Date(Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
        parts.millisecond
    ));
    const nextWallClockDate = addRecurringInterval(wallClockDate, type);

    return zonedPartsToDate({
        year:nextWallClockDate.getUTCFullYear(),
        month:nextWallClockDate.getUTCMonth() + 1,
        day:nextWallClockDate.getUTCDate(),
        hour:nextWallClockDate.getUTCHours(),
        minute:nextWallClockDate.getUTCMinutes(),
        second:nextWallClockDate.getUTCSeconds(),
        millisecond:nextWallClockDate.getUTCMilliseconds(),
    }, timeZone);
}

export const calculateNextOccurance = calculateNextOccurrence
