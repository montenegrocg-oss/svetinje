# Deployment

## Production platform

Production deployment is handled by GitHub Actions and targets the existing Cloudflare Worker.

| Setting | Current value |
| --- | --- |
| Worker name | `svetinje` |
| Production branch | `main` |
| Hosting model | Cloudflare Workers Static Assets |
| Root path | `/` |
| Static output directory | `dist/` |
| Wrangler configuration | `wrangler.jsonc` |
| Deployment workflow | `.github/workflows/deploy-cloudflare.yml` |
| Temporary URL | <https://svetinje.montenegro-cg.workers.dev> |

The repository does not use Cloudflare Pages and does not define a Worker runtime script. The static assets in `dist/` are deployed to the same Worker named `svetinje`.

## Automated deployment

The **Deploy to Cloudflare** workflow runs automatically for every push to `main`. It may also be started manually with `workflow_dispatch`. Pull requests are not production deployment triggers.

The workflow uses Node.js 24 and pnpm 11.9.0, then performs these steps in order:

1. Check out the repository.
2. Install pnpm.
3. Set up Node.js with the pnpm dependency cache.
4. Install locked dependencies with `pnpm install --frozen-lockfile`.
5. Run validation, tests, and TypeScript checks with `pnpm run check`.
6. Build the static Astro site with `pnpm run build`.
7. Deploy the generated static assets with Cloudflare Wrangler.

The deployment action runs this Wrangler command:

```sh
wrangler deploy --config wrangler.jsonc
```

The configuration fixes the Worker name as `svetinje`, enables its `workers.dev` URL and preview URLs, and publishes static assets from `./dist`. Deployment concurrency cancels an older in-progress production deployment when a newer one begins.

## Required GitHub secrets

The repository must define these GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Secret values must never be committed, placed in an `.env` file, printed in workflow logs, or added to documentation. The workflow references the protected GitHub secrets only through the deployment action inputs.

## Migration from Cloudflare Workers Builds

GitHub Actions is now the authoritative build and deployment pipeline. Cloudflare Workers Builds and its Git repository integration are no longer authoritative.

After the first successful GitHub Actions deployment has been verified at the existing Workers URL, the Cloudflare Git repository integration may be disconnected. This avoids duplicate deployments while preserving the same Worker and public URL.

Do not deploy production manually from a local development environment.

## Domains

The active deployment currently uses the temporary Workers URL. The custom domains `svetinje.me` and `svetinjecrnegore.me` are not connected yet.
