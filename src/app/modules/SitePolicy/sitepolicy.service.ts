import ApiError from "../../../errors/ApiError";
import { SitePolicyType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import httpStatus from "http-status";

const addSitePolicy = async (content: string, policyType:SitePolicyType) => {  
    const existingPolicy = await prisma.sitePolicy.findFirst({where:{type:policyType}});

    if (existingPolicy) {
        return await updateSitePolicy(existingPolicy.id, content);
    } else {
        return await prisma.sitePolicy.create({ data: {content, type:policyType} });
    }
}   


const updateSitePolicy = async (policyId: string, policy: string) => {
    const existingPolicy = await prisma.sitePolicy.findUnique({ where: { id: policyId} });

    if (!existingPolicy) {
        throw new ApiError(httpStatus.NOT_FOUND, "Site policy not found");
    }
    return await prisma.sitePolicy.update({
        where: { id: policyId },
        data: {content: policy},
    });
}

const getSitePolicies = async (type?:SitePolicyType) => {
    const policies = await prisma.sitePolicy.findMany({where:{type:type}});
    if (!policies || policies.length === 0) {
        throw new ApiError(httpStatus.NOT_FOUND, "Site policy not found");
    }

    return policies;
}

export const SitePolicyService = {
    addSitePolicy,
    updateSitePolicy,
    getSitePolicies
};