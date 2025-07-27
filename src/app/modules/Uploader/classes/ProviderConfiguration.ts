import { CloudProvider } from "../cloud.enum";
import { Configuration } from "../types/cloud.type";
import { IProviderConfiguration } from "./IProviderConfiguration";

class ProviderConfiguration implements IProviderConfiguration{

    private provider:CloudProvider
    
    constructor(provider:CloudProvider){
        this.provider = provider

    }

    getConfiguration():Configuration {
        throw new Error("Method not implemented.");
    }



    
}