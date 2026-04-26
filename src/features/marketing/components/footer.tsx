import Link from "next/link"

export function Footer() {
  return (
    <footer className="bg-surface-1">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Product
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
              </li>
              <li>
                <Link href="/about" className="text-muted-foreground hover:text-foreground">About</Link>
              </li>
              <li>
                <Link href="/status" className="text-muted-foreground hover:text-foreground">Status</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Legal
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/legal/terms" className="text-muted-foreground hover:text-foreground">Terms</Link></li>
              <li><Link href="/legal/privacy" className="text-muted-foreground hover:text-foreground">Privacy</Link></li>
              <li><Link href="/legal/dpa" className="text-muted-foreground hover:text-foreground">DPA</Link></li>
              <li><Link href="/legal/cookies" className="text-muted-foreground hover:text-foreground">Cookies</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Company
            </h3>
            <ul className="space-y-2 text-sm">
              <li><a href="mailto:hello@praxiomai.xyz" className="text-muted-foreground hover:text-foreground">Contact</a></li>
              <li><a href="https://praxiomai.xyz" className="text-muted-foreground hover:text-foreground">Praxiom</a></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Resources
            </h3>
            <ul className="space-y-2 text-sm">
              <li><a href="https://github.com/abhichat85/polaris" className="text-muted-foreground hover:text-foreground">GitHub</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-surface-3 pt-6">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Praxiom. Polaris is a trademark of Praxiom.
          </p>
        </div>
      </div>
    </footer>
  )
}
