export interface AdminEnv {
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_EDITORIAL_BRANCH?: string;
  ENVIRONMENT?: string;
  DEV_AUTH_BYPASS?: string;
  DEV_AUTH_EMAIL?: string;
  PUBLIC_MAPTILER_KEY?: string;
  ASSETS?: Fetcher;
}

export interface AdminSession {
  subject: string;
  email?: string;
  actor: string;
  developmentBypass: boolean;
}

export interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
}

export interface BranchState {
  headSha: string;
  treeSha: string;
}

export interface GitCommitResult {
  commitSha: string;
  branch: string;
}

export interface RepositoryFile {
  path: string;
  content: string;
}

export interface GitRepository {
  readBranchState(branch: string): Promise<BranchState>;
  readTree(treeSha: string): Promise<TreeEntry[]>;
  readBlob(sha: string): Promise<string>;
  readBlobs?(shas: string[]): Promise<Map<string, string>>;
  commitFilesAtomic(input: {
    branch: string;
    expectedHeadSha: string;
    baseTreeSha: string;
    files: RepositoryFile[];
    message: string;
  }): Promise<GitCommitResult>;
}
