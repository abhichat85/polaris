import { describe, it, expect, vi } from "vitest"
import {
  PIPELINE_STEPS,
  runDeployPipeline,
} from "@/features/deploy/inngest/deploy-pipeline"
import { InMemoryFileService } from "@/lib/files/in-memory-file-service"

interface FakeStep {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
  sleep: (name: string, ms: number) => Promise<void>
  ran: string[]
}

function makeFakeStep(): FakeStep {
  const ran: string[] = []
  return {
    ran,
    run: async (name, fn) => {
      ran.push(name)
      return fn()
    },
    sleep: async () => {},
  }
}

function makeConvex() {
  const calls: { ref: any; args: any }[] = []
  return {
    calls,
    mutation: vi.fn(async (ref: any, args: any) => {
      calls.push({ ref, args })
    }),
  }
}

function makeSupabase(overrides: Partial<any> = {}) {
  return {
    createProject: vi.fn(async () => ({
      id: "ref_abc",
      name: "polaris-app",
      status: "COMING_UP",
    })),
    getProject: vi.fn(async () => ({
      id: "ref_abc",
      name: "polaris-app",
      status: "ACTIVE_HEALTHY",
    })),
    runSQL: vi.fn(async () => ({})),
    getApiKeys: vi.fn(async () => ({
      anon: "anon_key",
      serviceRole: "service_key",
    })),
    ...overrides,
  } as any
}

function makeVercel(overrides: Partial<any> = {}) {
  return {
    getProject: vi.fn(async () => null),
    createProject: vi.fn(async () => ({ id: "prj_1", name: "polaris-app" })),
    createDeployment: vi.fn(async () => ({
      id: "dpl_1",
      url: "polaris-app.vercel.app",
      readyState: "QUEUED",
    })),
    getDeploymentStatus: vi.fn(async () => ({
      id: "dpl_1",
      url: "polaris-app.vercel.app",
      readyState: "READY",
    })),
    ...overrides,
  } as any
}

const baseEvent = {
  projectId: "proj_1",
  userId: "user_1",
  deploymentId: "dep_1",
  appName: "polaris-app",
  dbPassword: "p@ss",
}

describe("runDeployPipeline", () => {
  it("exposes 9 ordered pipeline steps", () => {
    expect(PIPELINE_STEPS).toHaveLength(9)
  })

  it("runs all 9 steps end-to-end on the happy path", async () => {
    const fakeStep = makeFakeStep()
    const convex = makeConvex()
    const supabase = makeSupabase()
    const vercel = makeVercel()
    const files = new InMemoryFileService()
    await files.createPath(
      baseEvent.projectId,
      "supabase/migrations/001_init.sql",
      "create table foo();",
      "user",
    )
    await files.createPath(baseEvent.projectId, "package.json", "{}", "user")

    const result = await runDeployPipeline(baseEvent, fakeStep, {
      convex,
      internalKey: "key",
      files,
      supabase,
      vercel,
    })

    expect(result.liveUrl).toBe("https://polaris-app.vercel.app")
    expect(fakeStep.ran).toEqual([
      "create-supabase-project",
      "wait-supabase-ready",
      "capture-api-keys",
      "run-migrations",
      "read-project-files",
      "ensure-vercel-project",
      "create-vercel-deployment",
      "wait-vercel-ready",
      "save-live-url",
    ])

    expect(supabase.createProject).toHaveBeenCalledWith(
      "polaris-app",
      "us-east-1",
      "p@ss",
    )
    expect(supabase.runSQL).toHaveBeenCalledWith(
      "ref_abc",
      "create table foo();",
    )
    expect(vercel.createProject).toHaveBeenCalled()
    expect(vercel.createDeployment).toHaveBeenCalled()
    const [, files_arg, env] = vercel.createDeployment.mock.calls[0]
    const paths = files_arg.map((f: any) => f.file).sort()
    expect(paths).toContain("package.json")
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://ref_abc.supabase.co")
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("anon_key")
  })

  it("skips creating a Vercel project when one already exists", async () => {
    const vercel = makeVercel({
      getProject: vi.fn(async () => ({ id: "prj_1", name: "polaris-app" })),
    })
    await runDeployPipeline(baseEvent, makeFakeStep(), {
      convex: makeConvex(),
      internalKey: "key",
      files: new InMemoryFileService(),
      supabase: makeSupabase(),
      vercel,
    })
    expect(vercel.createProject).not.toHaveBeenCalled()
  })

  it("calls markSucceeded with the live URL", async () => {
    const convex = makeConvex()
    await runDeployPipeline(baseEvent, makeFakeStep(), {
      convex,
      internalKey: "key",
      files: new InMemoryFileService(),
      supabase: makeSupabase(),
      vercel: makeVercel(),
    })
    const succeed = convex.calls.find(
      (c) => c.args.liveUrl === "https://polaris-app.vercel.app",
    )
    expect(succeed).toBeDefined()
  })

  it("marks the deployment failed when a step throws", async () => {
    const convex = makeConvex()
    const supabase = makeSupabase({
      createProject: vi.fn(async () => {
        throw new Error("supabase down")
      }),
    })

    await expect(
      runDeployPipeline(baseEvent, makeFakeStep(), {
        convex,
        internalKey: "key",
        files: new InMemoryFileService(),
        supabase,
        vercel: makeVercel(),
      }),
    ).rejects.toThrow(/supabase down/)

    const failure = convex.calls.find((c) => c.args.errorMessage === "supabase down")
    expect(failure).toBeDefined()
    expect(failure?.args.currentStep).toBe("Create Supabase project")
  })

  it("times out if Supabase never becomes healthy", async () => {
    let now = 1_000
    const supabase = makeSupabase({
      getProject: vi.fn(async () => ({
        id: "ref_abc",
        name: "p",
        status: "COMING_UP",
      })),
    })
    const sleep = vi.fn(async () => {
      now += 1_000
    })

    await expect(
      runDeployPipeline(baseEvent, makeFakeStep(), {
        convex: makeConvex(),
        internalKey: "key",
        files: new InMemoryFileService(),
        supabase,
        vercel: makeVercel(),
        now: () => now,
        sleep,
        supabasePollIntervalMs: 1_000,
        supabaseTimeoutMs: 5_000,
      }),
    ).rejects.toThrow(/ACTIVE_HEALTHY/)
  })

  it("fails when Vercel build returns ERROR state", async () => {
    const vercel = makeVercel({
      getDeploymentStatus: vi.fn(async () => ({
        id: "dpl_1",
        url: "x",
        readyState: "ERROR",
      })),
    })
    await expect(
      runDeployPipeline(baseEvent, makeFakeStep(), {
        convex: makeConvex(),
        internalKey: "key",
        files: new InMemoryFileService(),
        supabase: makeSupabase(),
        vercel,
      }),
    ).rejects.toThrow(/error/i)
  })
})
