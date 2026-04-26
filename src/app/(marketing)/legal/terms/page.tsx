import { LegalPage } from "@/features/marketing/components/legal-page"

export const metadata = { title: "Terms of Service — Polaris by Praxiom" }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effectiveDate="April 26, 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of Polaris, an
        AI-powered cloud IDE provided by Praxiom (&quot;we&quot;, &quot;us&quot;). By creating an
        account or using Polaris, you agree to these Terms.
      </p>

      <h2>1. Your account</h2>
      <p>
        You must be at least 13 years old (or the minimum age of digital
        consent in your country) to use Polaris. You are responsible for
        keeping your credentials secure and for all activity under your
        account.
      </p>

      <h2>2. Your code is yours</h2>
      <p>
        Polaris is designed so you own everything you build. We grant ourselves
        no license to use, train on, or commercialize the code you generate
        beyond the technical processing required to operate the service.
      </p>

      <h2>3. Acceptable use</h2>
      <p>
        You may not use Polaris to build apps that violate applicable law,
        infringe intellectual property, harass or harm individuals, or
        circumvent the daily cost ceiling and rate limits we enforce.
      </p>

      <h2>4. The free tier is real</h2>
      <p>
        Free-tier limits are documented on our pricing page. We will not bill
        you for free-tier usage. Paid plans bill via Stripe; you may cancel at
        any time and remain entitled to access through the end of your billing
        period.
      </p>

      <h2>5. AI output</h2>
      <p>
        Polaris uses third-party LLMs to generate code. Output may contain
        bugs, inaccurate libraries, or copyright-marginal patterns. You are
        responsible for reviewing what gets shipped to your users.
      </p>

      <h2>6. Termination</h2>
      <p>
        You may delete your account at any time from{" "}
        <a href="/settings/account">/settings/account</a>; deletion cascades
        across our records and our subprocessors per our privacy notice. We
        may suspend accounts that abuse the service.
      </p>

      <h2>7. Liability</h2>
      <p>
        Polaris is provided &quot;as is&quot;. To the fullest extent permitted by law,
        our aggregate liability is capped at the amount you paid us in the
        12 months preceding the claim.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these Terms; we will notify active users by email at
        least 30 days before material changes take effect.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions: <a href="mailto:hello@praxiomai.xyz">hello@praxiomai.xyz</a>.
      </p>
    </LegalPage>
  )
}
