import { LegalPage } from "@/features/marketing/components/legal-page"

export const metadata = { title: "Privacy Policy — Polaris by Praxiom" }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effectiveDate="April 26, 2026">
      <p>
        This Privacy Policy explains what Polaris (operated by Praxiom)
        collects, why, and what rights you have. We follow GDPR principles
        for all users worldwide; if you are in the EU/UK, you have the
        statutory rights described in section 6.
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — email, name, OAuth identifiers
          (Clerk-managed).
        </li>
        <li>
          <strong>Project data</strong> — code, conversations, file paths you
          create. Stored in Convex (US/EU regions), encrypted in transit.
        </li>
        <li>
          <strong>Usage data</strong> — token counts, deploy counts, error
          rates. Used for billing and quota enforcement.
        </li>
        <li>
          <strong>Third-party tokens</strong> — when you connect GitHub or
          Stripe, we store the resulting tokens AES-256-GCM-encrypted at rest.
          Never logged, never sent to the client.
        </li>
      </ul>

      <h2>2. How we use it</h2>
      <p>
        Operate the service, enforce quotas, communicate about your account,
        and produce aggregate non-identifying usage metrics. We do not sell
        your data, do not use it to train AI models, and do not run third-
        party advertising.
      </p>

      <h2>3. Subprocessors</h2>
      <p>
        Polaris depends on the following processors. Each handles your data
        only as needed to perform their function and is bound by a DPA:
      </p>
      <ul>
        <li>Clerk (auth)</li>
        <li>Convex (primary database)</li>
        <li>Inngest (background jobs)</li>
        <li>E2B (sandbox runtime)</li>
        <li>Vercel (hosting + deploy target)</li>
        <li>Supabase (deploy target database)</li>
        <li>Stripe (billing)</li>
        <li>Anthropic, OpenAI, Google (LLM providers)</li>
        <li>Sentry (error monitoring — payloads are redacted)</li>
      </ul>

      <h2>4. Retention</h2>
      <p>
        We keep project and conversation data for as long as your account is
        active. Deleting a project removes it within 30 days from primary
        storage and from backups within 90 days. Deleting your account
        triggers cascade deletion across all subprocessors per our DPA.
      </p>

      <h2>5. Security</h2>
      <p>
        TLS in transit. AES-256-GCM at rest for OAuth/API tokens. Sentry and
        log payloads pass through redaction (emails, secrets, prompt bodies
        stripped). Public secret-scan blocks any push that contains a secret.
      </p>

      <h2>6. Your rights</h2>
      <p>You may, at any time:</p>
      <ul>
        <li>
          Export everything we hold about you:{" "}
          <a href="/api/gdpr/export">/api/gdpr/export</a> (returns a JSON
          bundle).
        </li>
        <li>
          Delete your account:{" "}
          <a href="/settings/account">/settings/account</a> — irreversible.
        </li>
        <li>
          Disconnect any integration (GitHub, Stripe customer portal) at any
          time from settings.
        </li>
      </ul>

      <h2>7. Cookies</h2>
      <p>
        See <a href="/legal/cookies">our cookie notice</a> for the full list.
        We use only essential cookies by default; analytics or marketing
        cookies require explicit opt-in via the consent banner.
      </p>

      <h2>8. Contact / DPO</h2>
      <p>
        Email <a href="mailto:privacy@praxiomai.xyz">privacy@praxiomai.xyz</a>.
        EU residents may also contact their local data protection authority.
      </p>
    </LegalPage>
  )
}
