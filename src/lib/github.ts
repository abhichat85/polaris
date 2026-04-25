const GITHUB_API_BASE = "https://api.github.com";

export interface GitHubUser {
    id: number;
    login: string;
    avatar_url: string;
    html_url: string;
}

export interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
    default_branch: string;
}

export class GitHubClient {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = endpoint.startsWith("http")
            ? endpoint
            : `${GITHUB_API_BASE}${endpoint}`;

        const headers = {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            ...options.headers,
        };

        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(
                `GitHub API error: ${response.status} ${error.message || response.statusText
                }`
            );
        }

        return response.json();
    }

    async getCurrentUser(): Promise<GitHubUser> {
        return this.request<GitHubUser>("/user");
    }

    async getRepositories(): Promise<GitHubRepo[]> {
        return this.request<GitHubRepo[]>("/user/repos?sort=updated&per_page=100");
    }

    async createRepository(name: string, isPrivate: boolean): Promise<GitHubRepo> {
        return this.request<GitHubRepo>("/user/repos", {
            method: "POST",
            body: JSON.stringify({
                name,
                private: isPrivate,
                auto_init: true, // Create with README so we have a branch to work with
            }),
        });
    }

    // --- Git Database API for atomic commits ---

    async createBlob(owner: string, repo: string, content: string): Promise<string> {
        const data = await this.request<{ sha: string }>(
            `/repos/${owner}/${repo}/git/blobs`,
            {
                method: "POST",
                body: JSON.stringify({
                    content,
                    encoding: "utf-8",
                }),
            }
        );
        return data.sha;
    }

    async getRef(owner: string, repo: string, ref: string): Promise<string> {
        const data = await this.request<{ object: { sha: string } }>(
            `/repos/${owner}/${repo}/git/ref/${ref}`
        );
        return data.object.sha;
    }

    async createTree(
        owner: string,
        repo: string,
        baseTreeSha: string | null,
        tree: { path: string; mode: "100644" | "100755" | "040000"; type: "blob" | "tree"; sha?: string; content?: string }[]
    ): Promise<string> {
        const body: any = { tree };
        if (baseTreeSha) body.base_tree = baseTreeSha;

        const data = await this.request<{ sha: string }>(
            `/repos/${owner}/${repo}/git/trees`,
            {
                method: "POST",
                body: JSON.stringify(body),
            }
        );
        return data.sha;
    }

    async createCommit(
        owner: string,
        repo: string,
        message: string,
        treeSha: string,
        parentSha: string
    ): Promise<string> {
        const data = await this.request<{ sha: string }>(
            `/repos/${owner}/${repo}/git/commits`,
            {
                method: "POST",
                body: JSON.stringify({
                    message,
                    tree: treeSha,
                    parents: [parentSha],
                }),
            }
        );
        return data.sha;
    }

    async updateRef(owner: string, repo: string, ref: string, sha: string): Promise<void> {
        await this.request(`/repos/${owner}/${repo}/git/refs/${ref}`, {
            method: "PATCH",
            body: JSON.stringify({
                sha,
                force: true,
            }),
        });
    }
}

// OAuth Helpers
export const getGitHubOAuthUrl = () => {
    const params = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "",
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/github/callback`,
        scope: "repo read:user",
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
};

export const exchangeGitHubCode = async (code: string): Promise<string> => {
    const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
        }),
    });

    if (!response.ok) {
        throw new Error("Failed to exchange code");
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error_description || data.error);
    }

    return data.access_token;
};
