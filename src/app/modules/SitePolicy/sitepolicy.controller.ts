
import { SitePolicyType } from "../../../prismaClient";
import sendResponse from "../../../shared/ApiResponse";
import catchAsync from "../../../shared/catchAsync";
import { SitePolicyService } from "./sitepolicy.service";
import { Request, Response } from "express";


const addOrUpdateSitePolicy = catchAsync(async (req:any, res:Response) => {
    const { content, type } = req.body;

    let addedOrUpdatedData =  await SitePolicyService.addSitePolicy(content, type as SitePolicyType);

    sendResponse(res, {
        success: true,
        message: "Site policy added successfully",
        data: addedOrUpdatedData,
        statusCode: 201,
    })
} ) 

const getAllPolicies = catchAsync(async (req: Request, res: Response) => {
    const { type } = req.query;

    const policyType = typeof type === "string" ? (type as SitePolicyType) : undefined;
    const policies = await SitePolicyService.getSitePolicies(policyType);

    sendResponse(res, {
        success: true,
        message: "Site policies fetched successfully",
        data: policies,
        statusCode: 200,
    });
});

export const SitePolicyController = {
    addOrUpdateSitePolicy,
    getAllPolicies
};