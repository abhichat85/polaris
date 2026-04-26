/**
 * Pre-push secret scanner. Authority: CONSTITUTION §13.3, sub-plan 06 Task 8.
 *
 * Regex-based, intentionally conservative — false positives are acceptable
 * (user can scrub the file); false negatives are not (we MUST NOT push secrets
 * to a public repo). There is no force-push override.
 *
 * Adding a new pattern: append to SECRET_PATTERNS with `category` and `regex`.
 * Test the new pattern in `secret-scan.test.ts`.
 */

export interface SecretPattern {
  category: string
  regex: RegExp
  description: string
}

/**
 * Patterns sourced from gitleaks defaults + Anthropic + Stripe + OpenAI docs.
 * The `g` flag is required for matchAll line tracking.
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    category: "aws_access_key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    description: "AWS Access Key ID",
  },
  {
    category: "aws_secret_key",
    regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    description: "AWS Secret Access Key (heuristic — high false-positive rate)",
  },
  {
    category: "github_token",
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
    description: "GitHub PAT / OAuth / app token",
  },
  {
    category: "stripe_key",
    regex: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/g,
    description: "Stripe secret key",
  },
  {
    category: "anthropic_key",
    regex: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_\-]{60,}\b/g,
    description: "Anthropic API key",
  },
  {
    category: "openai_key",
    regex: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_\-]{20,}\b/g,
    description: "OpenAI API key (not ant- prefixed)",
  },
  {
    category: "google_api_key",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    description: "Google API key",
  },
  {
    category: "private_key",
    regex:
      /-----BEGIN (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----[\s\S]+?-----END (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/g,
    description: "PEM private key block",
  },
  {
    category: "slack_token",
    regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    description: "Slack token",
  },
  {
    category: "jwt",
    regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    description: "JWT (could be a real session token)",
  },
] as const

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff",
  "pdf", "zip", "tar", "gz", "tgz", "rar", "7z",
  "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "flac", "ogg",
  "ttf", "otf", "woff", "woff2", "eot",
  "exe", "dll", "so", "dylib", "bin", "wasm",
  "psd", "ai", "sketch", "fig",
])

function isBinaryPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase()
  return ext ? BINARY_EXTENSIONS.has(ext) : false
}

export interface SecretFinding {
  path: string
  line: number
  column: number
  category: string
  /** First 16 chars of the match — for UI display, never a real secret. */
  preview: string
}

export interface ScanResult {
  clean: boolean
  findings: SecretFinding[]
}

export function scanContent(content: string): Omit<SecretFinding, "path">[] {
  const findings: Omit<SecretFinding, "path">[] = []
  // Pre-compute line offsets for line-number lookups.
  const lineOffsets: number[] = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") lineOffsets.push(i + 1)
  }
  const offsetToLine = (offset: number): { line: number; column: number } => {
    // Binary search would be faster but linear is fine for v1.
    let line = 1
    for (let i = 0; i < lineOffsets.length; i++) {
      if (lineOffsets[i] > offset) break
      line = i + 1
    }
    return { line, column: offset - lineOffsets[line - 1] + 1 }
  }

  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for stateful global regexes.
    pattern.regex.lastIndex = 0
    const matches = content.matchAll(pattern.regex)
    for (const m of matches) {
      const offset = m.index ?? 0
      const { line, column } = offsetToLine(offset)
      findings.push({
        line,
        column,
        category: pattern.category,
        preview: m[0].slice(0, 16),
      })
    }
  }

  return findings
}

export interface ScanInput {
  path: string
  content: string
}

export function scanFiles(files: readonly ScanInput[]): ScanResult {
  const findings: SecretFinding[] = []
  for (const file of files) {
    if (isBinaryPath(file.path)) continue
    const fileFindings = scanContent(file.content)
    for (const f of fileFindings) {
      findings.push({ ...f, path: file.path })
    }
  }
  return { clean: findings.length === 0, findings }
}
