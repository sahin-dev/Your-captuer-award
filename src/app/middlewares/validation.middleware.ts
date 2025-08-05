import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodType } from "zod";

const validateRequest =
  (schema: ZodType<any, any>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      return next();
    } catch (err) {
      next(err);
    }
  };

  

export default validateRequest;
