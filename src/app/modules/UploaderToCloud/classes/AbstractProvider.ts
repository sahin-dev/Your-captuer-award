
abstract class Provider implements IProvider{

    uploadToCloud(): { Location: string; } {
        throw new Error("Method not implemented.");
    }
    
}