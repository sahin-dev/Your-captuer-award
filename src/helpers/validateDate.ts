import ApiError from "../errors/ApiError";
import httpStatus from 'http-status'

export const validateContestDate = (startDate: string, endDate:string): boolean => {    
    
  const start = new Date(startDate);
  const end = new Date(endDate);
  const currentDate = new Date(Date.now())

  if( (start > end) /*|| (start < currentDate)*/) {
    return false
  }

  // Check if the contest date is in the past
  return true;
}

