import sendResponse from "./ApiResponse";
import catchAsync from "./catchAsync";

// Most handlers do the same three things: call a service, catch errors, send the
// standard response. This does all three, so a handler is one line:
//   const getRules = respondWith("Rules fetched", req => service.getRules(req.params.id))
export const respondWith = (
  message: string,
  run: (req: any) => Promise<unknown>,
  statusCode = 200,
) =>
  catchAsync(async (req, res) => {
    sendResponse(res, { statusCode, success: true, message, data: await run(req) });
  });
