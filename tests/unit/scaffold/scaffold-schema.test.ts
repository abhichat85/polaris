import { describe, it, expect } from "vitest"
import {
  MAX_FILE_SIZE_BYTES,
  MAX_GENERATED_FILES,
  MAX_TOTAL_BYTES,
  ScaffoldSchema,
} from "@/features/scaffold/types"

describe("ScaffoldSchema", () => {
  it("accepts a minimal valid response", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "A todo list app with Supabase auth.",
      files: [
        { path: "src/app/page.tsx", content: "export default function Page() { return <div /> }" },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty summary", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "",
      files: [{ path: "src/app/page.tsx", content: "x" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty file array", () => {
    const result = ScaffoldSchema.safeParse({ summary: "x", files: [] })
    expect(result.success).toBe(false)
  })

  it("rejects more than MAX_GENERATED_FILES", () => {
    const files = Array.from({ length: MAX_GENERATED_FILES + 1 }, (_, i) => ({
      path: `src/app/p${i}.tsx`,
      content: "x",
    }))
    const result = ScaffoldSchema.safeParse({ summary: "x", files })
    expect(result.success).toBe(false)
  })

  it("rejects file content exceeding MAX_FILE_SIZE_BYTES", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [{ path: "src/app/big.tsx", content: "x".repeat(MAX_FILE_SIZE_BYTES + 1) }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects total content exceeding MAX_TOTAL_BYTES", () => {
    const big = "x".repeat(MAX_FILE_SIZE_BYTES)
    const files = Array.from(
      { length: Math.ceil(MAX_TOTAL_BYTES / MAX_FILE_SIZE_BYTES) + 1 },
      (_, i) => ({ path: `src/app/big${i}.ts`, content: big }),
    )
    const result = ScaffoldSchema.safeParse({ summary: "x", files })
    expect(result.success).toBe(false)
  })

  it("rejects absolute paths", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [{ path: "/etc/passwd", content: "x" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects parent traversal", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [{ path: "src/../../escape.ts", content: "x" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty path", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [{ path: "", content: "x" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects directory paths (trailing slash)", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [{ path: "src/components/", content: "x" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects duplicate file paths", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [
        { path: "src/app/page.tsx", content: "a" },
        { path: "src/app/page.tsx", content: "b" },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects paths with invalid characters (spaces)", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [{ path: "src/app/my page.tsx", content: "x" }],
    })
    expect(result.success).toBe(false)
  })
})
