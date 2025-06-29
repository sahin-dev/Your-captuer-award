export interface IUserRegister {
    socialProvider?:string
    socialId?:string
    fullName?:string
    avatar?:string
    firstName?:string
    lastName?:string
    phone?:string
    email?:string
    password?:string
    confirmPassword?:string
}
export interface IUserUpdate {
    firstName?: string,
    lastName?:string,
    phone?:string,

}

export interface IPasswordUpdate {

    password:string
    confirmPassword:string
}