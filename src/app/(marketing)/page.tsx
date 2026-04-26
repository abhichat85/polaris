import Link from "next/link"

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-surface-0">
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <h1 className="font-heading max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-foreground md:text-6xl">
            From idea to running app, in one chat.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Polaris is an AI-powered cloud IDE. Describe what you want, watch it
            build, and deploy a real Next.js app you actually own — code and all.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <Link
              href="/sign-up"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start building free
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              See pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-surface-1">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
            What makes Polaris different
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg bg-surface-3 p-6">
                <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">
                  {f.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-surface-0">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
            Ready to ship?
          </h2>
          <p className="mt-4 text-muted-foreground">
            No credit card. Free tier includes 100 agent runs / month and 1 deploy.
          </p>
          <Link
            href="/sign-up"
            className="mt-8 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start building
          </Link>
        </div>
      </section>
    </>
  )
}

const FEATURES = [
  {
    title: "You own your code",
    body:
      "Push to your GitHub the moment you want to. No exit tax, no proprietary format. Polaris emits standard Next.js — you can take it anywhere.",
  },
  {
    title: "Real apps, not toys",
    body:
      "Polaris generates apps with proper auth, database, and deploy pipelines wired up. Supabase + Vercel by default. Live preview from the first prompt.",
  },
  {
    title: "Spec-driven, not vibe-driven",
    body:
      "Every project has a feature spec the agent can update. You see the plan before it builds, and you can edit it any time. No black box.",
  },
]
