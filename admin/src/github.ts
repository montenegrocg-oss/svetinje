import { createPrivateKey } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { AdminError, internalFailure } from "./errors.ts";
import type { AdminEnv, BranchState, GitCommitResult, GitRepository, RepositoryFile, TreeEntry } from "./types.ts";

const API_VERSION = "2022-11-28";
const PKCS1_HEADER = "-----BEGIN RSA PRIVATE KEY-----";
const PKCS8_HEADER = "-----BEGIN PRIVATE KEY-----";
const GRAPHQL_BLOB_BATCH_SIZE = 80;

type GitHubAuthenticationStage =
  | "configuration_incomplete"
  | "private_key_import_failed"
  | "app_jwt_sign_failed"
  | "installation_token_http_failure"
  | "installation_token_response_invalid"
  | "repository_request_rejected";

type GitHubRepositoryOperation =
  | "branch_ref"
  | "commit"
  | "tree"
  | "blob"
  | "create_blob"
  | "create_tree"
  | "create_commit"
  | "update_ref";

function authenticationFailure(
  stage: GitHubAuthenticationStage,
  fields: { status?: number; operation?: GitHubRepositoryOperation; missing?: string[] } = {},
): AdminError {
  return new AdminError("github_authentication_failure", 502, stage, { stage, ...fields });
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
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
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
    const appId = GITHUB_APP_ID?.trim();
    const installationId = GITHUB_APP_INSTALLATION_ID?.trim();
    const privateKeySecret = GITHUB_APP_PRIVATE_KEY?.trim();
    const requiredConfiguration: Array<[string, string | undefined]> = [
      ["GITHUB_APP_ID", appId],
      ["GITHUB_APP_INSTALLATION_ID", installationId],
      ["GITHUB_APP_PRIVATE_KEY", privateKeySecret],
    ];
    const missing = requiredConfiguration.filter(([, value]) => !value?.trim()).map(([name]) => name);
    if (!appId || !installationId || !privateKeySecret) {
      throw authenticationFailure("configuration_incomplete", { missing });
    }
    let key: CryptoKey;
    try {
      key = await importGitHubAppPrivateKey(privateKeySecret);
    } catch {
      throw authenticationFailure("private_key_import_failed");
    }

    let appJwt: string;
    try {
      const now = Math.floor(this.#now() / 1000);
      appJwt = await new SignJWT({})
        .setProtectedHeader({ alg: "RS256" })
        .setIssuedAt(now - 30)
        .setExpirationTime(now + 540)
        .setIssuer(appId)
        .sign(key);
    } catch {
      throw authenticationFailure("app_jwt_sign_failed");
    }

    let response: Response;
    try {
      response = await this.#fetch(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
        method: "POST",
        headers: this.#headers(appJwt),
        body: JSON.stringify({ repositories: [this.#repo], permissions: { contents: "write" } }),
      });
    } catch {
      throw authenticationFailure("installation_token_http_failure");
    }
    if (!response.ok) {
      throw authenticationFailure("installation_token_http_failure", { status: response.status });
    }

    try {
      const body = await response.json() as { token?: unknown };
      if (typeof body.token !== "string" || !body.token.trim()) {
        throw authenticationFailure("installation_token_response_invalid", { status: response.status });
      }
      return body.token;
    } catch (error) {
      if (error instanceof AdminError) throw error;
      throw authenticationFailure("installation_token_response_invalid", { status: response.status });
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

  async #request<T>(operation: GitHubRepositoryOperation, path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.#installationToken();
    let response: Response;
    try {
      response = await this.#fetch(`https://api.github.com/repos/${this.#owner}/${this.#repo}${path}`, {
        ...init,
        headers: { ...this.#headers(token), ...(init.headers ?? {}) },
      });
    } catch {
      if (operation === "branch_ref" || operation === "commit" || operation === "tree" || operation === "blob") {
        throw internalFailure("repository_request_failed", { operation });
      }
      throw new AdminError("internal_error", 502, "GitHub request failed");
    }
    if (!response.ok) {
      if (response.status === 409 || response.status === 422) {
        throw new AdminError("git_conflict", 409, "Git ref update was rejected");
      }
      if (response.status === 401 || response.status === 403) {
        throw authenticationFailure("repository_request_rejected", { status: response.status, operation });
      }
      if (operation === "branch_ref" || operation === "commit" || operation === "tree" || operation === "blob") {
        throw internalFailure("repository_request_failed", { status: response.status, operation });
      }
      throw new AdminError("internal_error", 502, "GitHub request failed");
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }

  async readBranchState(branch: string): Promise<BranchState> {
    const ref = await this.#request<{ object: { sha: string } }>("branch_ref", `/git/ref/heads/${encodeURIComponent(branch)}`);
    const commit = await this.#request<{ tree: { sha: string } }>("commit", `/git/commits/${ref.object.sha}`);
    return { headSha: ref.object.sha, treeSha: commit.tree.sha };
  }

  async readTree(treeSha: string): Promise<TreeEntry[]> {
    const result = await this.#request<{ tree: TreeEntry[]; truncated?: boolean }>("tree", `/git/trees/${treeSha}?recursive=1`);
    if (result.truncated) throw new AdminError("internal_error", 502, "GitHub returned a truncated repository tree");
    return result.tree;
  }

  async readBlob(sha: string): Promise<string> {
    const blob = await this.#request<{ content: string; encoding: string }>("blob", `/git/blobs/${sha}`);
    if (blob.encoding !== "base64") throw new AdminError("internal_error", 502, "Unexpected GitHub blob encoding");
    const compact = blob.content.replace(/\s/g, "");
    const bytes = Uint8Array.from(atob(compact), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async readBlobs(shas: string[]): Promise<Map<string, string>> {
    const uniqueShas = [...new Set(shas)];
    if (uniqueShas.length === 0) return new Map();
    if (uniqueShas.some((sha) => !/^[0-9a-f]{40}$/i.test(sha))) {
      throw internalFailure("catalog_blob_decode_failed");
    }

    const blobs = new Map<string, string>();
    for (let offset = 0; offset < uniqueShas.length; offset += GRAPHQL_BLOB_BATCH_SIZE) {
      const batch = uniqueShas.slice(offset, offset + GRAPHQL_BLOB_BATCH_SIZE);
      const selections = batch.map((sha, index) => (
        `blob${index}: object(oid: "${sha}") { ... on Blob { isBinary text } }`
      )).join("\n");
      const token = await this.#installationToken();
      let response: Response;
      try {
        response = await this.#fetch("https://api.github.com/graphql", {
          method: "POST",
          headers: this.#headers(token),
          body: JSON.stringify({
            query: `query ReadRepositoryBlobs($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { ${selections} } }`,
            variables: { owner: this.#owner, repo: this.#repo },
          }),
        });
      } catch {
        throw internalFailure("repository_request_failed", { operation: "blob" });
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw authenticationFailure("repository_request_rejected", { status: response.status, operation: "blob" });
        }
        throw internalFailure("repository_request_failed", { status: response.status, operation: "blob" });
      }

      let body: { data?: { repository?: Record<string, { isBinary?: unknown; text?: unknown } | null> | null }; errors?: unknown };
      try {
        body = await response.json() as typeof body;
      } catch {
        throw internalFailure("catalog_blob_decode_failed");
      }
      if (body.errors || !body.data?.repository) throw internalFailure("catalog_blob_decode_failed");
      for (const [index, sha] of batch.entries()) {
        const value = body.data.repository[`blob${index}`];
        if (!value || value.isBinary === true || typeof value.text !== "string") {
          throw internalFailure("catalog_blob_decode_failed");
        }
        blobs.set(sha, value.text);
      }
    }
    return blobs;
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
    const binaryBlobs = new Map<string, string>();
    await Promise.all(input.files.flatMap((file) => "base64" in file ? [
      this.#request<{ sha: string }>("create_blob", "/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: file.base64, encoding: "base64" }),
      }).then(({ sha }) => binaryBlobs.set(file.path, sha)),
    ] : []));
    const tree = await this.#request<{ sha: string }>("create_tree", "/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: input.baseTreeSha,
        tree: input.files.map((file) => {
          if ("delete" in file) return { path: file.path, mode: "100644", type: "blob", sha: null };
          if ("base64" in file) return { path: file.path, mode: "100644", type: "blob", sha: binaryBlobs.get(file.path) };
          return { path: file.path, mode: "100644", type: "blob", content: file.content };
        }),
      }),
    });
    const commit = await this.#request<{ sha: string }>("create_commit", "/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [input.expectedHeadSha] }),
    });
    const beforeUpdate = await this.readBranchState(input.branch);
    if (beforeUpdate.headSha !== input.expectedHeadSha) {
      throw new AdminError("git_conflict", 409, "Editorial branch moved before ref update");
    }
    await this.#request("update_ref", `/git/refs/heads/${encodeURIComponent(input.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    return { commitSha: commit.sha, branch: input.branch };
  }
}
