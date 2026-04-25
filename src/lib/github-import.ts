import AdmZip from "adm-zip";

export interface ImportedFile {
    path: string;
    content: string | Buffer;
    isBinary: boolean;
}

export async function parseGitHubUrl(url: string) {
    try {
        const urlObj = new URL(url);
        const parts = urlObj.pathname.split("/").filter(Boolean);
        if (parts.length < 2) return null;
        return {
            owner: parts[0],
            repo: parts[1],
        };
    } catch {
        return null;
    }
}

function isBinaryFile(path: string, buffer: Buffer): boolean {
    // Simple check: extension or null bytes
    const ext = path.split(".").pop()?.toLowerCase();
    const binaryExts = [
        "png", "jpg", "jpeg", "gif", "ico", "svg",
        "pdf", "zip", "tar", "gz", "woff", "woff2",
        "ttf", "eot", "mp3", "mp4", "mov", "avi"
    ];
    if (ext && binaryExts.includes(ext)) return true;

    // Detection for likely text files
    const textExts = ["js", "jsx", "ts", "tsx", "css", "html", "json", "md", "txt", "py", "rb", "java", "c", "cpp", "h", "go", "rs"];
    if (ext && textExts.includes(ext)) return false;

    // Fallback: Check for null bytes in the first 1000 bytes
    for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
        if (buffer[i] === 0) return true;
    }
    return false;
}

export async function fetchAndUnzipRepository(
    owner: string,
    repo: string,
    token?: string
): Promise<ImportedFile[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/zipball`;
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        throw new Error(`Failed to fetch repository: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    const files: ImportedFile[] = [];

    for (const entry of zipEntries) {
        if (entry.isDirectory) continue;

        const fullPath = entry.entryName;
        // Remove the first directory component (GitHub zipballs have a root folder like owner-repo-sha)
        const pathParts = fullPath.split("/");
        const cleanPath = pathParts.slice(1).join("/");

        if (!cleanPath) continue;

        const entryBuffer = entry.getData();
        const isBinary = isBinaryFile(cleanPath, entryBuffer);

        files.push({
            path: `/${cleanPath}`,
            content: isBinary ? entryBuffer : entry.getData().toString("utf-8"),
            isBinary,
        });
    }

    return files;
}
