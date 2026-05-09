import { Product, ProductType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { paginationHelper } from "../../../helpers/paginationHelper";
import ApiError from "../../../errors/ApiError";


const addProduct = async (productData: { title: string; productType: ProductType; quantity: number; amount: number; description?: string; image?: string; icon?: string }) => {
    const product = await prisma.product.create({ data: productData })

    return product
}

const getAllProductByType = async (type:ProductType, page?:number, limit?:number)=>{
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({
        page: page || 1,
        limit: limit || 10
    })
    const products = await prisma.product.findMany({where:{
        productType:type
    },
        skip,
        
        take: paginationLimit
    })

    const total = await prisma.product.count({where:{productType:type}})
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

const updateProduct = async (productId:string, data: Partial<{title: string, amount: number, quantity: number, description?: string, image?: string, icon?: string}>) => {
    const product = await prisma.product.findUnique({ where: { id: productId } })
    console.log("product", product)
    if (!product) {
        throw new ApiError(404, "Product not found")
    }
    const updatedProduct = await prisma.product.update({
        where: { id: productId },
        data: data
    })

    return updatedProduct
}

const deleteProduct = async (productId:string) => {
    const product = await prisma.product.findUnique({ where: { id: productId } })
    console.log("product", product)
    if (!product) {
        throw new ApiError(404, "Product not found")
    }

    await prisma.product.delete({
        where: { id: productId }
    })

    return product
}

export const storeService = {
    addProduct,
    getAllProductByType,
    getProductDetails,
    updateProduct,
    deleteProduct,
    getAllProduct
}