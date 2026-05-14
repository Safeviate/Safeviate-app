# Safeviate Manager

This is a Next.js app deployed on Azure App Service with Azure Database for PostgreSQL and Azure Blob Storage.

For local development, copy `.env.local.example` to `.env.local` and set the required runtime env vars there. For Azure, set the production values in App Service application settings:

- `RESEND_API_KEY`
- `MAIL_FROM`
- `NEXT_PUBLIC_APP_URL` if you want to override the deployment URL
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `AUTH_SEED_EMAIL`
- `AUTH_SEED_PASSWORD` or `AUTH_SEED_PASSWORD_HASH`
- `Safeviate_AI_KEY` for AI flows, with `OPENAI_API_KEY` kept as a fallback
- `OPENAIP_API_KEY` for the map tile proxy
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_CONTAINER_NAME`

## Prisma (Development)

This repo now includes Prisma alongside existing Drizzle code during migration.

1. Install deps:
`npm install`

2. Generate client:
`npm run prisma:generate`

3. Push schema to the Azure database from local `.env.local`:
`npm run prisma:push:local`

Keep local auth URLs on `http://localhost:9002`, and set both `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in `.env.local` to the Azure PostgreSQL connection string with `sslmode=verify-full`.

## Card Layout Standard

For card shells, header bands, border tokens, and compact control rows, use the coherence matrix specimen as the visual reference and follow the `safeviate-card-layout-standard` skill.
