import { createPrivateKey } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { AdminError } from "./errors.ts";
import type { AdminEnv, BranchState, GitCommitResult, GitRepository, RepositoryFile, TreeEntry } from "./types.ts";

const API_VERSION = "2022-11-28";
const PKCS1_HEADER = "-----BEGIN RSA PRIVATE KEY-----";
const PKCS8_HEADER = "-----BEGIN PRIVATE KEY-----";

type GitHubAuthenticationFailure =
  | "private_key_import_failed"
  | "installation_token_http_failure"
  | "installation_token_response_invalid";

function authenticationFailure(reason: GitHubAuthenticationFailure): AdminError {
  return new AdminError("github_authentication_failure", 502, reason);
}

async function importGitHubAppPrivateKey(privateKeySecret: string): Promise<CryptoKey> {
  const privateKeyPem = privateKeySecret.replaceAll("\\n", "\n").trim();

  if (privateKeyPem.startsWith(PKCS8_HEADER)) {
    return importPKCS8(privateKeyPem, "RS256");
  }

  if (privateKeyPem.startsWith(PKCS1_HEADER)) {
    const keyObject = createPrivateKey({ key: privateKeyPem, format: "pem" });
    const pkcs8Pem = keyObject.export({ type: "pkcs8", format: "pem" });
    return importPKCS8(pkcs8Pem.toString(), "RS256");
  }

  throw authenticationFailure("private_key_import_failed");
}

export function editorialBranch(env: AdminEnv): string {
  const branch = env.GITHUB_EDITORIAL_BRANCH?.trim();
  if (!branch || branch === "main") {
    throw new AdminError("invalid_editorial_branch", 503, "Editorial branch must be configured and cannot be main");
  }
  return branch;
}

export interface GitHubRepositoryOptions {
  env: AdminEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class GitHubRepository implements GitRepository {
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #owner: string;
  readonly #repo: string;
  #tokenPromise?: Promise<string>;

  private readonly options: GitHubRepositoryOptions;

  constructor(options: GitHubRepositoryOptions) {
    this.options = options;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#owner = options.env.GITHUB_OWNER?.trim() || "montenegrocg-oss";
    this.#repo = options.env.GITHUB_REPO?.trim() || "svetinje";
  }

  async #installationToken(): Promise<string> {
    if (this.#tokenPromise) return this.#tokenPromise;
    this.#tokenPromise = this.#createInstallationToken();
    return this.#tokenPromise;
  }

  async #createInstallationToken(): Promise<string> {
    const { GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY } = this.options.env;
    if (!GITHUB_APP_ID?.trim() || !GITHUB_APP_INSTALLATION_ID?.trim() || !GITHUB_APP_PRIVATE_KEY?.trim()) {
      throw new AdminError("github_authentication_failure", 502, "GitHub App configuration is incomplete");
    }
    let key: CryptoKey;
    try {
      key = await importGitHubAppPrivateKey(GITHUB_APP_PRIVATE_KEY);
    } catch {
      throw authenticationFailure("private_key_import_failed");
    }

    const now = Math.floor(this.#now() / 1000);
    let appJwt: string;
    try {
      appJwt = await new SignJWT({})
        .setProtectedHeader({ alg: "RS256" })
        .setIssuedAt(now - 30)
        .setExpirationTime(now + 540)
        .setIssuer(GITHUB_APP_ID.trim())
        .sign(key);
    } catch {
      throw authenticationFailure("private_key_import_failed");
    }

    let response: Response;
    try {
      response = await this.#fetch(`https://api.github.com/app/installations/${encodeURIComponent(GITHUB_APP_INSTALLATION_ID.trim())}/access_tokens`, {
        method: "POST",
        headers: this.#headers(appJwt),
        body: JSON.stringify({ repositories: [this.#repo], permissions: { contents: "write" } }),
      });
    } catch {
      throw authenticationFailure("installation_token_http_failure");
    }

    if (!response.ok) {
      throw authenticationFailure("installation_token_http_failure");
    }

    try {
      const body = await response.json() as { token?: unknown };
      if (typeof body.token !== "string" || !body.token.trim()) {
        throw authenticationFailure("installation_token_response_invalid");
      }
      return body.token;
    } catch (error) {
      if (error instanceof AdminError) throw error;
      throw authenticationFailure("installation_token_response_invalid");
    }
  }

  #headers(token: string): HeadersInit {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": API_VERSION,
      "user-agent": "svetinje-admin-worker",
    };
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.#installationToken();
    const response = await this.#fetch(`https://api.github.com/repos/${this.#owner}/${this.#repo}${path}`, {
      ...init,
      headers: { ...this.#headers(token), ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      if (response.status === 409 || response.status === 422) {
        throw new AdminError("git_conflict", 409, "Git ref update was rejected");
      }
      if (response.status === 401 || response.status === 403) {
        throw new AdminError("github_authentication_failure", 502, "GitHub rejected installation authentication");
      }
      throw new AdminError("internal_error", 502, `GitHub request failed with status ${response.status}`);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }

  async readBranchState(branch: string): Promise<BranchState> {
    const ref = await this.#request<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(branch)}`);
    const commit = await this.#request<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
    return { headSha: ref.object.sha, treeSha: commit.tree.sha };
  }

  async readTree(treeSha: string): Promise<TreeEntry[]> {
    const result = await this.#request<{ tree: TreeEntry[]; truncated?: boolean }>(`/git/trees/${treeSha}?recursive=1`);
    if (result.truncated) throw new AdminError("internal_error", 502, "GitHub returned a truncated repository tree");
    return result.tree;
  }

  async readBlob(sha: string): Promise<string> {
    const blob = await this.#request<{ content: string; encoding: string }>(`/git/blobs/${sha}`);
    if (blob.encoding !== "base64") throw new AdminError("internal_error", 502, "Unexpected GitHub blob encoding");
    const compact = blob.content.replace(/\s/g, "");
    const bytes = Uint8Array.from(atob(compact), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async commitFilesAtomic(input: {
    branch: string;
    expectedHeadSha: string;
    baseTreeSha: string;
    files: RepositoryFile[];
    message: string;
  }): Promise<GitCommitResult> {
    const current = await this.readBranchState(input.branch);
    if (current.headSha !== input.expectedHeadSha) {
      throw new AdminError("git_conflict", 409, "Editorial branch moved before commit creation");
    }
    const tree = await this.#request<{ sha: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: input.baseTreeSha,
        tree: input.files.map((file) => ({ path: file.path, mode: "100644", type: "blob", content: file.content })),
      }),
    });
    const commit = await this.#request<{ sha: string }>("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [input.expectedHeadSha] }),
    });
    const beforeUpdate = await this.readBranchState(input.branch);
    if (beforeUpdate.headSha !== input.expectedHeadSha) {
      throw new AdminError("git_conflict", 409, "Editorial branch moved before ref update");
    }
    await this.#request(`/git/refs/heads/${encodeURIComponent(input.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    return { commitSha: commit.sha, branch: input.branch };
  }
}
