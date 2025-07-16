import { Configuration, DOConfuration } from "../types/cloud.type"
import { IProviderConfiguration } from "./IProviderConfiguration"

export class DigitalOceanConfiguration implements IProviderConfiguration{
    private configuration:Configuration

    constructor (configuration:Configuration){
        this.configuration = configuration
    }

    public getConfiguration(){
        return this.configuration
    }
}