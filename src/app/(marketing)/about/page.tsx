export default function AboutPage() {
  return (
    <section className="bg-surface-0">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="font-heading text-4xl font-semibold tracking-[-0.02em] text-foreground">
          About Polaris
        </h1>
        <div className="mt-8 space-y-6 text-base leading-relaxed text-muted-foreground">
          <p>
            Polaris is built by Praxiom. We believe that the gap between
            &quot;I have an idea&quot; and &quot;I have a running app&quot; should be measured in
            minutes, not weeks — and that you should still own everything you
            build.
          </p>
          <p>
            The tools you&apos;ve seen in this space generate code you can&apos;t leave
            with, lock you into proprietary runtimes, or hide the engineering
            decisions behind a chat box. Polaris does the opposite: every
            project is real Next.js, every deploy goes to Vercel + Supabase
            under your account, and every agent step is visible and editable.
          </p>
          <p>
            Polaris is open about its limits. The agent runs on Claude (with
            GPT-5 + Gemini 3 fallbacks), it&apos;s not allowed to spend more than
            your daily cap, and it always shows you its plan before executing.
            If something goes wrong, you see a real error message — never a
            vague &quot;something went wrong&quot;.
          </p>
          <p>
            Get in touch:{" "}
            <a
              className="text-primary hover:underline"
              href="mailto:hello@praxiomai.xyz"
            >
              hello@praxiomai.xyz
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}
