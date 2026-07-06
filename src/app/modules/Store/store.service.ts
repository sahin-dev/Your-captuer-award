import { Product, ProductType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { paginationHelper } from "../../../helpers/paginationHelper";


const addProduct = async (title:string, productType:ProductType, quantity:number, amount:number)=>{
        const product = await prisma.product.create({data:{productType, amount, quantity, title}})

        return product

}

const getAllProductByType = async (type:ProductType)=>{
    const products = await prisma.product.findMany({where:{productType:type}})

    return products
}
const getAllProduct = async (type?:ProductType, page?: number, limit?: number) => {

    if(type){
        return getAllProductByType(type)
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({
        page: page || 1,
        limit: limit || 10
    })

    const products = await prisma.product.findMany({
        skip,
        take: paginationLimit
    })

    const total = await prisma.product.count()
    const totalPages = Math.ceil(total / paginationLimit)

    return {
        meta: {
            page: page || 1,
            limit: paginationLimit,
            total,
            totalPages
        },
        data: products
    }
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