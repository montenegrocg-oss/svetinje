import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { AdminError } from "./errors.ts";
import type { AdminEnv, AdminSession } from "./types.ts";

function normalizedTeamDomain(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (url.protocol !== "https:") throw new AdminError("unauthenticated", 401, "Access team domain must use HTTPS");
  return url.origin;
}

function auditActor(claims: { email?: unknown; sub?: unknown }): string {
  const source = typeof claims.email === "string" ? claims.email.split("@")[0] : claims.sub;
  const normalized = String(source ?? "admin")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) && normalized.length >= 2
    ? normalized.slice(0, 100).replace(/-+$/g, "")
    : "admin-user";
}

export async function authenticateRequest(request: Request, env: AdminEnv): Promise<AdminSession> {
  const production = env.ENVIRONMENT === "production";
  if (!production && env.DEV_AUTH_BYPASS === "true") {
    const email = env.DEV_AUTH_EMAIL?.trim() || "local-admin@localhost";
    return { subject: "local-development", email, actor: auditActor({ email }), developmentBypass: true };
  }

  const teamDomain = normalizedTeamDomain(env.CLOUDFLARE_ACCESS_TEAM_DOMAIN);
  const audience = env.CLOUDFLARE_ACCESS_AUD?.trim();
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!teamDomain || !audience || !assertion) {
    throw new AdminError("unauthenticated", 401, "Missing Access authentication configuration or assertion");
  }

  let payload: JWTPayload;
  try {
    const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    ({ payload } = await jwtVerify(assertion, jwks, {
      issuer: teamDomain,
      audience,
      algorithms: ["RS256"],
    }));
  } catch {
    throw new AdminError("unauthenticated", 401, "Cloudflare Access JWT validation failed");
  }

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (!email) throw new AdminError("unauthenticated", 401, "Cloudflare Access JWT validation failed");
  const subject = typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : email;
  return {
    subject,
    email,
    actor: auditActor({ email, sub: subject }),
    developmentBypass: false,
  };
}
