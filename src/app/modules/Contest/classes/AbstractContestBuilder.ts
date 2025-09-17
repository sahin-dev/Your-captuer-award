import { Contest, ContestStatus, RecurringContest } from "../../../../prismaClient";

export abstract class AbstractContestBuilder {
    protected contest:any = {
        status:ContestStatus.UPCOMING,
        isMoneyContest: false
    }

    constructor (private creatorId:string){
        this.contest.creatorId = creatorId
    }

    title (titile:string){
        this.contest.title =  titile
        return this
    }

    description (description:string){
        this.contest.description = description
        return this
    }

    levelRequirements (levels:string[]){
        this.contest.level_requirements = levels.map(l => parseInt(l))

        return this
    }

    banner (url:string | null){
        if(url){
            this.contest.banner = url
        }
        return this
    }

    dates(start: string | Date, end: string | Date) {
        let startDate = new Date(start)
        let endDate = new Date(end)

        if(endDate >= startDate){
            throw new Error("start date must be greated than end date")
        }

        this.contest.startDate = startDate
        this.contest.endDate = endDate
        return this
    }

    moneyContest(minPrize: number, maxPrize: number) {

        if (minPrize > maxPrize){
            throw new Error("max prize must be greater than min prize")
        }
        this.contest.isMoneyContest = true
        this.contest.minPrize = minPrize
        this.contest.maxPrize = maxPrize
        return this
    }

    abstract build():Contest | RecurringContest
}