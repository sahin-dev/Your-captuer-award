import { LevelName } from "../../../prismaClient"


export interface ITeam {
    name:string
    level:string
    language:string
    country:string
    description:string
    accessibility:string
    min_requirement:string
}