import { ObjectCannedACL, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import config from "../../../config";
import { ProviderConfiguration, Configuration, DOConfuration } from "./types/cloud.type";
import { CloudProvider } from "./cloud.enum";
import { DigitalOceanConfiguration } from "./classes/DigitalOceanConfiguration";
import { IProviderConfiguration } from "./classes/IProviderConfiguration";



export class CloudUploader {
    private client:any;
    private projectName?:string
    private configuration:IProviderConfiguration

    constructor(projectName:string){
        this.configuration = this.getCloudConfiguration()

        try{
            this.init(this.configuration)
        }catch(e){
            throw e;
        }
    }

    private getCloudConfiguration():IProviderConfiguration{
        if (!config.cloud || (config.cloud.length <= 0)){
            throw new Error('No cloud provider configured!')
        }

        let cloudConfig = config.cloud[0] as Configuration

        if (cloudConfig.provider === CloudProvider.digitalOcean){
            return new DigitalOceanConfiguration(cloudConfig)
        } else {
            throw new Error('Unsupported cloud provider!')
        }
    }

    init(providerConfiguration:IProviderConfiguration){
        let client = undefined
        let configuration = providerConfiguration.getConfiguration()
        if (providerConfiguration instanceof DigitalOceanConfiguration){
            client = this.initDigitalOceanClient(configuration)
        }
        else if (configuration.provider === CloudProvider.cloudinary){
            client = this.initCloudinaryClient(configuration)
        }
        this.setClient(client)
        
    }

    private initDigitalOceanClient (configuration:Configuration){
        const s3Client = new S3Client({
                region: "us-east-1",
                endpoint: configuration.endpoint,
                credentials: {
                    accessKeyId: configuration.access_key || "",
                    secretAccessKey: configuration.secret_key || "",
                },
            });

            return s3Client
    }

    private initCloudinaryClient (configuration:Configuration){

    }

    private setClient(client:any){
        this.client = client
    }

    public getClient(){
        if (this.client === undefined){
            throw new Error("Client is not initialized yet!")
        }
        return this.client
    }

    private async uploadToDigitalOcean(file: Express.Multer.File){
        let doConfig = this.configuration.getConfiguration()
         
        try {
            if (!this.client  || this.client !== CloudProvider.digitalOcean){
                throw new Error("Client is not initialized or not digitalOcean")
            }
            let id = this.getUUIDv4()
            
            const Key = `${this.projectName}/${Date.now()}_${id}_${file.originalname}`;
            const uploadParams = {
              Bucket: doConfig.bucket || "",
              Key,
              Body: file.buffer, // ✅ Use buffer instead of file path
              ACL: "public-read" as ObjectCannedACL,
              ContentType: file.mimetype,
            };
        
            // Upload file to DigitalOcean Spaces
            await this.client.send(new PutObjectCommand(uploadParams));
          
        
            // Format the URL
            const fileURL = `${doConfig.endpoint}/${doConfig.bucket}/${Key}`;
            return {
              Location: fileURL,
              Bucket: doConfig.bucket || "",
              Key,
            };
          } catch (error) {
            console.error("Error uploading file to DigitalOcean:", error);
            throw error;
          }finally {
            this.client.destroy()
          }

    }

    private getUUIDv4(){
    
        return uuidv4();
    }

    public  uploadToCloud(file:Express.Multer.File){
        let cloudConfig = this.configuration.getConfiguration()
        if (!file){
            throw new Error("File is required!")
        }
        if  (cloudConfig.provider && cloudConfig.provider === CloudProvider.digitalOcean){
            return this.uploadToDigitalOcean(file)
        }
    }

}