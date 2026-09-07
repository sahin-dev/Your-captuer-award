import { ZodError, ZodIssue } from 'zod';
// import { TErrorSources, TGenericErrorResponse } from '../interface/error';

const handleZodError = (err: ZodError): any => {
  const errorSources: any = err.issues.map((issue: ZodIssue) => {
    return {
      path: issue?.path[issue.path.length - 1],
      message: issue.message,
    };
  });

  const statusCode = 400;

  // The top-level `message` is what most clients show directly (toasts, alerts) -
  // a bare "Validation Error" told the user nothing was wrong without opening the
  // response body. Fold the specific field issues into it so every caller gets a
  // useful message for free, while `errorSources` still carries the structured list.
  const message =
    errorSources
      .map((source: { path?: unknown; message: string }) =>
        source.path ? `${String(source.path)}: ${source.message}` : source.message,
      )
      .join('; ') || 'Validation Error';

  return {
    statusCode,
    message,
    errorSources,
  };
};

export default handleZodError;
