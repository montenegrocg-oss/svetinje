# Deployment

## Current platform

Svetinje.me is connected to Cloudflare through the repository's GitHub integration.

| Setting | Current value |
| --- | --- |
| Cloudflare project | `svetinje` |
| Production branch | `main` |
| Hosting model | Cloudflare Workers Static Assets |
| Root path | `/` |
| Static output directory | `dist/` |
| Temporary URL | <https://svetinje.montenegro-cg.workers.dev> |

The deployment configuration is managed externally in Cloudflare. The repository does not contain or require Cloudflare Pages configuration or a Wrangler configuration file for the current setup.

## Automated deployment

Commits to `main` trigger Cloudflare's connected GitHub build and production deployment automatically. The configured build command is:

```sh
pnpm run build
```

This command runs content validation before Astro creates the static production output in `dist/`.

The production deploy command configured in Cloudflare is:

```sh
npx wrangler@latest deploy --assets ./dist --name svetinje --compatibility-date 2026-08-03
```

The non-production deploy command configured in Cloudflare is:

```sh
npx wrangler@latest versions upload --assets ./dist --name svetinje --compatibility-date 2026-08-03
```

These commands document the external Cloudflare build configuration. Normal production releases happen through commits to `main`; they are not run manually as part of the repository workflow.

## Build environment

Cloudflare Workers Builds uses:

```text
NODE_VERSION=24
PNPM_VERSION=11.9.0
```

## Domains

The active deployment currently uses the temporary Workers URL. The custom domains `svetinje.me` and `svetinjecrnegore.me` are not connected yet.

## Security boundary

API tokens, secrets, Cloudflare account IDs, and other private Cloudflare information must not be committed to this repository or added to this document. Sensitive deployment values belong only in the appropriate protected Cloudflare configuration.
