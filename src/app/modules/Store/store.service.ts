import { Product, ProductType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";


const addProduct = async (title:string, productType:ProductType, quantity:number, amount:number)=>{
        const product = await prisma.product.create({data:{productType, amount, quantity, title}})

        return product

}

const getAllProductByType = async (type:ProductType)=>{
    const products = await prisma.product.findMany({where:{productType:type}})

    return products
}
const getAllProduct = async (type?:ProductType) => {

    if(type){
        return getAllProductByType(type)
    }

    const structuredData = new Map<string, Product[]>()
    const products = await prisma.product.findMany({})

    products.forEach( product => {
        if (structuredData.has(product.productType)){
            let productArray = structuredData.get(product.productType)
            productArray?.push(product)
        }else {
            let productArray = []
            productArray.push(product)
            structuredData.set(product.productType, productArray)
        }
    })

    return Object.fromEntries(structuredData)
}



const getProductDetails = async (productId:string)=>{
    const product = await prisma.product.findUnique({where:{id:productId}})

    

    return product
}

const updateProduct = async (title:string, amount:number, quantity:number)=>{
    
}

export const storeService = {
    addProduct,
    getAllProductByType,
    getProductDetails,
    updateProduct,
    getAllProduct
}