import { HeroSection } from "@/features/marketing/components/landing/hero-section"
import { HowItWorksSection } from "@/features/marketing/components/landing/how-it-works-section"
import { FeaturesSection } from "@/features/marketing/components/landing/features-section"
import { ForSection } from "@/features/marketing/components/landing/for-section"
import { FaqSection } from "@/features/marketing/components/landing/faq-section"
import { PricingTeaserSection } from "@/features/marketing/components/landing/pricing-teaser-section"
import { CtaSection } from "@/features/marketing/components/landing/cta-section"

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <ForSection />
      <FaqSection />
      <PricingTeaserSection />
      <CtaSection />
    </>
  )
}
