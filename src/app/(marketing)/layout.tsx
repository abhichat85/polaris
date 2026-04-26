import type { Metadata } from "next"
import { MarketingHeader } from "@/features/marketing/components/marketing-header"
import { Footer } from "@/features/marketing/components/footer"

export const metadata: Metadata = {
  title: "Polaris by Praxiom — From idea to running app, in one chat.",
  description:
    "Polaris is an AI-powered cloud IDE that turns natural-language ideas into deployable Next.js apps. Built by Praxiom.",
  openGraph: {
    title: "Polaris by Praxiom",
    description: "From idea to running app, in one chat.",
    type: "website",
    url: "https://build.praxiomai.xyz",
  },
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-surface-0">
      <MarketingHeader />
      <main>{children}</main>
      <Footer />
    </div>
  )
}
