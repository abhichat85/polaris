/**
 * Contract<T> primitive — unit tests.
 *
 * Tests the buildEvalResult helper, CodeChangeContract, ReadOnlyQAContract,
 * and ScaffoldContract for correct scoring, hardPass logic, and edge cases.
 */

import { describe, it, expect } from "vitest"
import {
  buildEvalResult,
  type ContractConstraint,
  type ConstraintResult,
} from "@/lib/agent-kit/core/contract"
import {
  CodeChangeContract,
  type CodeChangeResult,
} from "@/lib/agent-kit/core/contracts/code-change-contract"
import {
  ReadOnlyQAContract,
  type ReadOnlyQAResult,
} from "@/lib/agent-kit/core/contracts/read-only-qa-contract"
import {
  ScaffoldContract,
  type ScaffoldResult,
} from "@/lib/agent-kit/core/contracts/scaffold-contract"

/* -------------------------------------------------------------------------- */
/*  buildEvalResult helper                                                     */
/* -------------------------------------------------------------------------- */

describe("buildEvalResult", () => {
  const constraints: ContractConstraint[] = [
    { id: "hard-1", description: "Hard constraint one", severity: "hard" },
    { id: "hard-2", description: "Hard constraint two", severity: "hard" },
    { id: "soft-1", description: "Soft constraint one", severity: "soft" },
  ]

  it("returns score=1 and hardPass=true when all constraints pass", () => {
    const results: ConstraintResult[] = [
      { constraintId: "hard-1", passed: true },
      { constraintId: "hard-2", passed: true },
      { constraintId: "soft-1", passed: true },
    ]
    const evalResult = buildEvalResult(results, constraints)
    expect(evalResult.score).toBe(1)
    expect(evalResult.hardPass).toBe(true)
    expect(evalResult.issues).toHaveLength(0)
  })

  it("returns hardPass=false when any hard constraint fails", () => {
    const results: ConstraintResult[] = [
      { constraintId: "hard-1", passed: false, detail: "oops" },
      { constraintId: "hard-2", passed: true },
      { constraintId: "soft-1", passed: true },
    ]
    const evalResult = buildEvalResult(results, constraints)
    expect(evalResult.hardPass).toBe(false)
    expect(evalResult.score).toBeLessThan(1)
    expect(evalResult.issues).toHaveLength(1)
    expect(evalResult.issues[0]).toContain("[HARD]")
    expect(evalResult.issues[0]).toContain("oops")
  })

  it("keeps hardPass=true when only soft constraints fail", () => {
    const results: ConstraintResult[] = [
      { constraintId: "hard-1", passed: true },
      { constraintId: "hard-2", passed: true },
      { constraintId: "soft-1", passed: false },
    ]
    const evalResult = buildEvalResult(results, constraints)
    expect(evalResult.hardPass).toBe(true)
    expect(evalResult.score).toBeLessThan(1)
    expect(evalResult.issues).toHaveLength(1)
    expect(evalResult.issues[0]).toContain("[SOFT]")
  })

  it("computes correct weighted score (hard=3, soft=1)", () => {
    // Total weight: 3 + 3 + 1 = 7
    // Earned: 3 (hard-2) + 1 (soft-1) = 4 (hard-1 fails)
    const results: ConstraintResult[] = [
      { constraintId: "hard-1", passed: false },
      { constraintId: "hard-2", passed: true },
      { constraintId: "soft-1", passed: true },
    ]
    const evalResult = buildEvalResult(results, constraints)
    expect(evalResult.score).toBeCloseTo(4 / 7)
  })

  it("returns score=0 when all constraints fail", () => {
    const results: ConstraintResult[] = [
      { constraintId: "hard-1", passed: false },
      { constraintId: "hard-2", passed: false },
      { constraintId: "soft-1", passed: false },
    ]
    const evalResult = buildEvalResult(results, constraints)
    expect(evalResult.score).toBe(0)
    expect(evalResult.hardPass).toBe(false)
    expect(evalResult.issues).toHaveLength(3)
  })

  it("returns score=1 for empty constraint results", () => {
    const evalResult = buildEvalResult([], constraints)
    expect(evalResult.score).toBe(1)
    expect(evalResult.hardPass).toBe(true)
    expect(evalResult.issues).toHaveLength(0)
  })

  it("skips constraint results with unknown IDs", () => {
    const results: ConstraintResult[] = [
      { constraintId: "unknown-id", passed: false, detail: "should be ignored" },
      { constraintId: "hard-1", passed: true },
    ]
    const evalResult = buildEvalResult(results, constraints)
    // Only hard-1 counted (weight 3, earned 3)
    expect(evalResult.score).toBe(1)
    expect(evalResult.hardPass).toBe(true)
    expect(evalResult.issues).toHaveLength(0)
  })

  it("formats issue without detail when detail is undefined", () => {
    const results: ConstraintResult[] = [
      { constraintId: "soft-1", passed: false },
    ]
    const evalResult = buildEvalResult(results, constraints)
    expect(evalResult.issues[0]).toBe("[SOFT] Soft constraint one")
  })

  it("formats issue with detail when detail is provided", () => {
    const results: ConstraintResult[] = [
      { constraintId: "hard-1", passed: false, detail: "file was deleted" },
    ]
    const evalResult = buildEvalResult(results, constraints)
    expect(evalResult.issues[0]).toBe("[HARD] Hard constraint one: file was deleted")
  })
})

/* -------------------------------------------------------------------------- */
/*  CodeChangeContract                                                         */
/* -------------------------------------------------------------------------- */

describe("CodeChangeContract", () => {
  const contract = new CodeChangeContract()

  const passingResult: CodeChangeResult = {
    changedPaths: ["src/lib/foo.ts", "src/lib/bar.ts"],
    scopePaths: ["src/lib/"],
    tscPassed: true,
    eslintPassed: true,
    testsPassed: true,
    hasPlaceholders: false,
    writeFileCount: 1,
    editFileCount: 3,
  }

  describe("metadata", () => {
    it("has correct id and name", () => {
      expect(contract.id).toBe("code-change")
      expect(contract.name).toBe("Code Change Contract")
    })

    it("defines 6 constraints", () => {
      expect(contract.constraints).toHaveLength(6)
    })

    it("has 3 hard and 3 soft constraints", () => {
      const hard = contract.constraints.filter((c) => c.severity === "hard")
      const soft = contract.constraints.filter((c) => c.severity === "soft")
      expect(hard).toHaveLength(3)
      expect(soft).toHaveLength(3)
    })
  })

  describe("toPromptRequirements()", () => {
    it("returns a non-empty string", () => {
      const prompt = contract.toPromptRequirements()
      expect(prompt.length).toBeGreaterThan(0)
    })

    it("includes all constraint descriptions", () => {
      const prompt = contract.toPromptRequirements()
      for (const c of contract.constraints) {
        expect(prompt).toContain(c.description)
      }
    })

    it("includes severity labels", () => {
      const prompt = contract.toPromptRequirements()
      expect(prompt).toContain("[HARD]")
      expect(prompt).toContain("[SOFT]")
    })

    it("includes header", () => {
      const prompt = contract.toPromptRequirements()
      expect(prompt).toContain("## Code Change Constraints")
    })
  })

  describe("evaluate()", () => {
    it("returns score=1 and hardPass=true when all constraints pass", () => {
      const evalResult = contract.evaluate(passingResult)
      expect(evalResult.score).toBe(1)
      expect(evalResult.hardPass).toBe(true)
      expect(evalResult.issues).toHaveLength(0)
      expect(evalResult.constraintResults).toHaveLength(6)
    })

    it("detects scope violation (hard fail)", () => {
      const result: CodeChangeResult = {
        ...passingResult,
        changedPaths: ["src/lib/foo.ts", "src/unrelated/hack.ts"],
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(false)
      expect(evalResult.score).toBeLessThan(1)
      const scopeResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "must-not-touch-paths-outside-scope",
      )
      expect(scopeResult?.passed).toBe(false)
      expect(scopeResult?.detail).toContain("src/unrelated/hack.ts")
    })

    it("detects placeholder code (hard fail)", () => {
      const result: CodeChangeResult = {
        ...passingResult,
        hasPlaceholders: true,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(false)
      const placeholderResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "must-not-leave-placeholders",
      )
      expect(placeholderResult?.passed).toBe(false)
    })

    it("detects TypeScript compilation failure (hard fail)", () => {
      const result: CodeChangeResult = {
        ...passingResult,
        tscPassed: false,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(false)
    })

    it("ESLint failure is a soft fail (hardPass stays true)", () => {
      const result: CodeChangeResult = {
        ...passingResult,
        eslintPassed: false,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(true)
      expect(evalResult.score).toBeLessThan(1)
    })

    it("testsPassed=null (no tests) counts as pass", () => {
      const result: CodeChangeResult = {
        ...passingResult,
        testsPassed: null,
      }
      const evalResult = contract.evaluate(result)
      const testResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "should-run-tests",
      )
      expect(testResult?.passed).toBe(true)
    })

    it("testsPassed=false counts as soft fail", () => {
      const result: CodeChangeResult = {
        ...passingResult,
        testsPassed: false,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(true)
      const testResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "should-run-tests",
      )
      expect(testResult?.passed).toBe(false)
    })

    it("detects low surgical edit ratio", () => {
      const result: CodeChangeResult = {
        ...passingResult,
        writeFileCount: 8,
        editFileCount: 2,
      }
      const evalResult = contract.evaluate(result)
      const surgicalResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "prefer-surgical-edits",
      )
      expect(surgicalResult?.passed).toBe(false)
      expect(surgicalResult?.detail).toContain("20%")
    })

    it("handles zero totalEdits (surgical ratio defaults to 1)", () => {
      const result: CodeChangeResult = {
        ...passingResult,
        writeFileCount: 0,
        editFileCount: 0,
      }
      const evalResult = contract.evaluate(result)
      const surgicalResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "prefer-surgical-edits",
      )
      expect(surgicalResult?.passed).toBe(true)
    })

    it("handles empty changedPaths (no scope violation)", () => {
      const result: CodeChangeResult = {
        ...passingResult,
        changedPaths: [],
      }
      const evalResult = contract.evaluate(result)
      const scopeResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "must-not-touch-paths-outside-scope",
      )
      expect(scopeResult?.passed).toBe(true)
    })

    it("scope check passes when changedPath exactly equals scopePath", () => {
      const result: CodeChangeResult = {
        ...passingResult,
        changedPaths: ["src/lib/foo.ts"],
        scopePaths: ["src/lib/foo.ts"],
      }
      const evalResult = contract.evaluate(result)
      const scopeResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "must-not-touch-paths-outside-scope",
      )
      expect(scopeResult?.passed).toBe(true)
    })
  })
})

/* -------------------------------------------------------------------------- */
/*  ReadOnlyQAContract                                                         */
/* -------------------------------------------------------------------------- */

describe("ReadOnlyQAContract", () => {
  const contract = new ReadOnlyQAContract()

  const passingResult: ReadOnlyQAResult = {
    attemptedWrites: false,
    addressedQuestion: true,
    citedSources: true,
  }

  describe("metadata", () => {
    it("has correct id and name", () => {
      expect(contract.id).toBe("read-only-qa")
      expect(contract.name).toBe("Read-Only Q&A Contract")
    })

    it("has 2 hard and 1 soft constraint", () => {
      const hard = contract.constraints.filter((c) => c.severity === "hard")
      const soft = contract.constraints.filter((c) => c.severity === "soft")
      expect(hard).toHaveLength(2)
      expect(soft).toHaveLength(1)
    })
  })

  describe("toPromptRequirements()", () => {
    it("includes READ-ONLY instruction", () => {
      const prompt = contract.toPromptRequirements()
      expect(prompt).toContain("READ-ONLY")
    })
  })

  describe("evaluate()", () => {
    it("returns score=1 when all constraints pass", () => {
      const evalResult = contract.evaluate(passingResult)
      expect(evalResult.score).toBe(1)
      expect(evalResult.hardPass).toBe(true)
      expect(evalResult.issues).toHaveLength(0)
    })

    it("mutation attempt fails hard", () => {
      const result: ReadOnlyQAResult = {
        ...passingResult,
        attemptedWrites: true,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(false)
      const mutateResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "must-not-mutate",
      )
      expect(mutateResult?.passed).toBe(false)
      expect(mutateResult?.detail).toContain("modify files")
    })

    it("not addressing question fails hard", () => {
      const result: ReadOnlyQAResult = {
        ...passingResult,
        addressedQuestion: false,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(false)
    })

    it("missing citations is a soft fail", () => {
      const result: ReadOnlyQAResult = {
        ...passingResult,
        citedSources: false,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(true)
      expect(evalResult.score).toBeLessThan(1)
    })
  })
})

/* -------------------------------------------------------------------------- */
/*  ScaffoldContract                                                           */
/* -------------------------------------------------------------------------- */

describe("ScaffoldContract", () => {
  const contract = new ScaffoldContract()

  const passingResult: ScaffoldResult = {
    tscPassed: true,
    buildPassed: true,
    hasPlaceholders: false,
    filesCreated: 10,
    hasRouting: true,
    hasStyling: true,
  }

  describe("metadata", () => {
    it("has correct id and name", () => {
      expect(contract.id).toBe("scaffold")
      expect(contract.name).toBe("Scaffold Contract")
    })

    it("has 3 hard and 3 soft constraints", () => {
      const hard = contract.constraints.filter((c) => c.severity === "hard")
      const soft = contract.constraints.filter((c) => c.severity === "soft")
      expect(hard).toHaveLength(3)
      expect(soft).toHaveLength(3)
    })
  })

  describe("toPromptRequirements()", () => {
    it("includes scaffolding header", () => {
      const prompt = contract.toPromptRequirements()
      expect(prompt).toContain("## Scaffold Constraints")
    })

    it("mentions project must be buildable", () => {
      const prompt = contract.toPromptRequirements()
      expect(prompt).toContain("functional and buildable")
    })
  })

  describe("evaluate()", () => {
    it("returns score=1 when all constraints pass", () => {
      const evalResult = contract.evaluate(passingResult)
      expect(evalResult.score).toBe(1)
      expect(evalResult.hardPass).toBe(true)
      expect(evalResult.issues).toHaveLength(0)
    })

    it("detects placeholder code (hard fail)", () => {
      const result: ScaffoldResult = {
        ...passingResult,
        hasPlaceholders: true,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(false)
      const placeholderResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "must-not-leave-placeholders",
      )
      expect(placeholderResult?.passed).toBe(false)
    })

    it("build failure is a hard fail", () => {
      const result: ScaffoldResult = {
        ...passingResult,
        buildPassed: false,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(false)
    })

    it("compile failure is a hard fail", () => {
      const result: ScaffoldResult = {
        ...passingResult,
        tscPassed: false,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(false)
    })

    it("missing routing is a soft fail", () => {
      const result: ScaffoldResult = {
        ...passingResult,
        hasRouting: false,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(true)
      expect(evalResult.score).toBeLessThan(1)
    })

    it("missing styling is a soft fail", () => {
      const result: ScaffoldResult = {
        ...passingResult,
        hasStyling: false,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(true)
      expect(evalResult.score).toBeLessThan(1)
    })

    it("fewer than 3 files is a soft fail", () => {
      const result: ScaffoldResult = {
        ...passingResult,
        filesCreated: 2,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(true)
      expect(evalResult.score).toBeLessThan(1)
      const filesResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "should-create-multiple-files",
      )
      expect(filesResult?.passed).toBe(false)
      expect(filesResult?.detail).toContain("2")
    })

    it("exactly 3 files passes the multiple files constraint", () => {
      const result: ScaffoldResult = {
        ...passingResult,
        filesCreated: 3,
      }
      const evalResult = contract.evaluate(result)
      const filesResult = evalResult.constraintResults.find(
        (cr) => cr.constraintId === "should-create-multiple-files",
      )
      expect(filesResult?.passed).toBe(true)
    })

    it("all hard constraints failing gives hardPass=false and low score", () => {
      const result: ScaffoldResult = {
        tscPassed: false,
        buildPassed: false,
        hasPlaceholders: true,
        filesCreated: 1,
        hasRouting: false,
        hasStyling: false,
      }
      const evalResult = contract.evaluate(result)
      expect(evalResult.hardPass).toBe(false)
      expect(evalResult.score).toBe(0)
      expect(evalResult.issues).toHaveLength(6)
    })
  })
})
