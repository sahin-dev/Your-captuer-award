import { ProductType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";


const addProduct = async (title:string, productType:ProductType, quantity:number, amount:number)=>{
        const product = await prisma.product.create({data:{productType, amount, quantity, title}})

        return product

}

const getAllProductByType = async (type:ProductType)=>{
    const products = await prisma.product.findMany({where:{productType:type}})

    return products
}



const getProductDetails = async (productId:string)=>{
    const product = await prisma.product.findUnique({where:{id:productId}})

    return product
}

const updateProduct = async (title:string, amount:number, quantity:number)=>{
    
}