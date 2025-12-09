import { NextFunction, Request, Response } from "express";
import {  ZodType } from "zod";

const validateRequest =
  (schema: ZodType<any, any>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {

      console.log(req.body)
      
      const parsedData = await schema.parseAsync(req.body);
      req.body = parsedData

      console.log("parsed data: ", parsedData)

      return next();
    } catch (err) {
      next(err);
    }
  };

  

export default validateRequest;
