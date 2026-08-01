export const validateContestDate = (startDate: string, endDate:string): boolean => {    
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();

  return !Number.isNaN(start.getTime())
    && !Number.isNaN(end.getTime())
    && start > now
    && end > start;
}

