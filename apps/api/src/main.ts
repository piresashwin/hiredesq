import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { ValidationPipe } from "@nestjs/common";
import fastifyMultipart from "@fastify/multipart";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  // rawBody: true exposes req.rawBody (Buffer) — required to verify the Stripe
  // webhook signature against the exact bytes Stripe signed (F8).
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    rawBody: true,
  });
  // Multipart uploads for the CV-parse pipeline (folder drops, CSV/Excel). Bound
  // the size so a single request can't exhaust memory; a folder is many files.
  await app.register(fastifyMultipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 200 },
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Allow the web app to call the API with credentials (cookies/auth headers).
  app.enableCors({
    origin: process.env.APP_URL ?? "http://localhost:3000",
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
