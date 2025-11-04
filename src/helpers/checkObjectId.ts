import { ObjectId } from "mongodb"

export const checkObjectId = (id:string):boolean => { 
   
    return ObjectId.isValid(id)
}