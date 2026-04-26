import { LegalPage } from "@/features/marketing/components/legal-page"

export const metadata = { title: "Data Processing Addendum — Polaris by Praxiom" }

export default function DPAPage() {
  return (
    <LegalPage title="Data Processing Addendum" effectiveDate="April 26, 2026">
      <p>
        This Data Processing Addendum (&quot;DPA&quot;) supplements the Polaris Terms
        of Service and applies whenever Praxiom processes Personal Data on
        behalf of you (the Customer) as a Processor.
      </p>

      <h2>1. Scope and roles</h2>
      <p>
        Customer is the Controller of Personal Data submitted to Polaris.
        Praxiom acts as Processor and engages the subprocessors listed in our
        Privacy Policy as sub-processors.
      </p>

      <h2>2. Subject matter and duration</h2>
      <p>
        Praxiom processes Personal Data only to (a) provide the Polaris
        service, (b) comply with Customer instructions consistent with the
        Terms, and (c) comply with applicable law. Processing continues for
        the term of the Customer&apos;s subscription plus the deletion windows in
        our Privacy Policy §4.
      </p>

      <h2>3. Confidentiality and personnel</h2>
      <p>
        All Praxiom personnel who access Customer Personal Data are bound by
        written confidentiality obligations. We follow least-privilege access
        and audit production access quarterly.
      </p>

      <h2>4. Security</h2>
      <p>
        We maintain appropriate technical and organizational measures: TLS in
        transit; AES-256-GCM for token-at-rest; audit logging via Sentry with
        redaction; pre-push secret scanning; rate limits; circuit breakers on
        every external dependency.
      </p>

      <h2>5. International transfers</h2>
      <p>
        Where Personal Data of EU/UK data subjects is transferred to a
        non-adequate country, the EU Standard Contractual Clauses apply by
        reference (Module Two — Controller to Processor).
      </p>

      <h2>6. Sub-processor changes</h2>
      <p>
        Customer authorizes the sub-processors listed in the Privacy Policy at
        the date of this DPA. We will notify active subscribers by email of
        any new sub-processor at least 30 days in advance and will offer a
        right to terminate the contract for material objection.
      </p>

      <h2>7. Data subject requests</h2>
      <p>
        Customer can fulfil GDPR Articles 15–22 requests directly via the
        export and deletion endpoints. We will provide reasonable assistance
        for any request that requires our involvement.
      </p>

      <h2>8. Audit</h2>
      <p>
        Customer may, upon 30 days&apos; written notice and no more than once per
        year, request a current security report (e.g. SOC 2 once available).
        On-site audits are by mutual agreement.
      </p>

      <h2>9. Deletion / return</h2>
      <p>
        On termination Customer may export all data via the GDPR endpoints
        within 30 days; thereafter Praxiom will delete or anonymize the data
        within the windows in the Privacy Policy unless retention is required
        by law.
      </p>

      <h2>10. Liability and conflict</h2>
      <p>
        Limitations of liability in the Terms apply to this DPA. Where this
        DPA conflicts with the Terms in respect of Personal Data, this DPA
        prevails.
      </p>
    </LegalPage>
  )
}
