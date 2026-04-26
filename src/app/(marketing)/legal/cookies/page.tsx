import { LegalPage } from "@/features/marketing/components/legal-page"

export const metadata = { title: "Cookie Notice — Polaris by Praxiom" }

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Notice" effectiveDate="April 26, 2026">
      <p>
        Polaris uses cookies and similar storage to keep you signed in and
        protect against CSRF. By default we set <em>only</em> essential
        cookies. Optional analytics or marketing cookies require explicit
        opt-in via the consent banner.
      </p>

      <h2>Essential cookies (always on)</h2>
      <ul>
        <li>
          <code>__session</code> (Clerk) — keeps you signed in.
        </li>
        <li>
          <code>polaris_gh_oauth_state</code> — short-lived CSRF token during
          GitHub OAuth (10 min lifetime, deleted on completion).
        </li>
        <li>
          <code>polaris_consent</code> — remembers your cookie preferences
          (legitimate interest under GDPR Recital 32).
        </li>
      </ul>

      <h2>Analytics (opt-in only)</h2>
      <p>
        Currently disabled. If we introduce analytics in the future, we will
        publish the vendor here and require fresh consent before any
        analytics cookie is set.
      </p>

      <h2>Marketing (opt-in only)</h2>
      <p>
        We do not run third-party advertising. This category exists solely so
        the consent banner is honest about its categories.
      </p>

      <h2>Manage your preferences</h2>
      <p>
        You can change your preferences at any time from{" "}
        <a href="/settings/privacy">Settings → Privacy</a> or by clicking
        &quot;Cookie preferences&quot; in the footer.
      </p>
    </LegalPage>
  )
}
