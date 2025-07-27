import { CloudProvider } from "../cloud.enum"

export type Configuration = {
    provider:string
    access_key:string
    secret_key:string
    endpoint?:string
    origin_endpoint?:string
    bucket?:string
}
export type DOConfuration  = Configuration & {
    provider:CloudProvider.digitalOcean
    endpoint:string
    origin_endpoint:string
    bucket:string
}

export type ProviderConfiguration = {
    provider:string
}