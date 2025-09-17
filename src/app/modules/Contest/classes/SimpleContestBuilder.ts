
import { Contest } from "../../../../prismaClient"
import { AbstractContestBuilder } from "./AbstractContestBuilder"

export class SimpleContestBuilder extends AbstractContestBuilder {
   

    build ():Contest{
        return {...this.contest}
    }

}