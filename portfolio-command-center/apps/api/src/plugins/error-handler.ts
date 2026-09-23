import fp from "fastify-plugin";
import type { FastifyError, FastifyInstance } from "fastify";

export default fp(async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "unhandled request error");

    if (error.validation) {
      reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "Request failed validation.", details: error.validation },
      });
      return;
    }

    const statusCode = error.statusCode ?? 500;
    const isServerError = statusCode >= 500;

    reply.code(statusCode).send({
      error: {
        code: isServerError ? "INTERNAL_ERROR" : "REQUEST_ERROR",
        // Never leak internal error detail to the client on a 5xx.
        message: isServerError ? "Something went wrong on our end." : error.message,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: { code: "NOT_FOUND", message: `Route ${request.method} ${request.url} not found.` } });
  });
});
