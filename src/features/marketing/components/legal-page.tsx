import { ReactNode } from "react"

interface LegalPageProps {
  title: string
  effectiveDate: string
  children: ReactNode
}

export function LegalPage({ title, effectiveDate, children }: LegalPageProps) {
  return (
    <section className="bg-surface-0">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground/70">
          Effective {effectiveDate}
        </p>
        <article className="prose prose-invert mt-8 max-w-none text-base leading-relaxed text-muted-foreground [&_h2]:font-heading [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-medium [&_h3]:text-foreground [&_p]:mt-4 [&_a]:text-primary [&_li]:mt-1 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </article>
      </div>
    </section>
  )
}
