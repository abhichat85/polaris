import Link from "next/link"

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "About", href: "/about" },
      { label: "Status", href: "/status" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: "mailto:hello@praxiomai.xyz", external: true },
      { label: "Praxiom", href: "https://praxiomai.xyz", external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      {
        label: "GitHub",
        href: "https://github.com/abhichat85/polaris",
        external: true,
      },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/legal/terms" },
      { label: "Privacy", href: "/legal/privacy" },
      { label: "DPA", href: "/legal/dpa" },
      { label: "Cookies", href: "/legal/cookies" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-foreground/[0.04] bg-surface-1 px-6 pb-8 pt-16 md:px-12 md:pt-20">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid gap-12 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span
                className="size-[7px] rounded-full bg-primary"
                style={{
                  boxShadow:
                    "0 0 8px hsl(var(--primary)), 0 0 16px hsl(var(--primary) / 0.3)",
                }}
              />
              <span className="font-heading text-[15px] font-bold tracking-[-0.02em] text-foreground">
                Polaris
                <span className="ml-1 font-normal text-muted-foreground/70">
                  by Praxiom
                </span>
              </span>
            </Link>
            <p className="mt-4 max-w-[260px] text-[12px] leading-[1.65] text-muted-foreground/70">
              A spec-driven AI cloud IDE for founders, builders, and product
              teams who ship.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/50">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-foreground/[0.04] pt-6 text-[12px] text-muted-foreground/50 md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} Praxiom. Polaris is a trademark of Praxiom.</span>
          <span className="font-mono text-muted-foreground/40">
            app.getpolaris.xyz
          </span>
        </div>
      </div>
    </footer>
  )
}
