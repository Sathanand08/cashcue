import { revalidateMoneyViews } from "@/lib/api/revalidate";
import { AppError, validationError } from "@/lib/services/errors";

type WithApiOptions = {
  /** When true, bust cached Overview/Forecast/etc. after a successful mutation. */
  revalidateMoney?: boolean;
};

/**
 * Runs a handler and maps the result to { data } or { error } JSON.
 * AppError keeps its code and status; anything else becomes a generic 500.
 */
export async function withApi(
  handler: () => unknown,
  status = 200,
  options: WithApiOptions = {},
): Promise<Response> {
  try {
    const data = await handler();
    if (options.revalidateMoney) {
      revalidateMoneyViews();
    }
    return Response.json({ data }, { status });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json(
        { error: { code: error.code, message: error.message, details: error.details } },
        { status: error.status },
      );
    }
    console.error(error);
    return Response.json(
      { error: { code: "INTERNAL", message: "Unexpected error" } },
      { status: 500 },
    );
  }
}

/** Parses a JSON request body; invalid JSON becomes VALIDATION_ERROR. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw validationError("Request body must be valid JSON");
  }
}
