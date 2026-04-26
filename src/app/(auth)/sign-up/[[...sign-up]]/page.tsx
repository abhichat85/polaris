import { SignUp } from "@clerk/nextjs";

// Praxiom — surface-2 card on surface-0 page; zero borders, surface contrast only.
export default function SignUpPage() {
  return (
    <SignUp
      appearance={{
        elements: {
          rootBox: "mx-auto",
          card: "bg-surface-2 shadow-elegant rounded-xl",
          headerTitle: "font-heading text-foreground tracking-[-0.01em]",
          headerSubtitle: "text-muted-foreground",
          socialButtonsBlockButton:
            "bg-surface-3 text-foreground hover:bg-surface-4 transition-colors",
          formFieldInput:
            "bg-surface-3 text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary",
          formButtonPrimary:
            "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
          footerActionLink: "text-primary hover:opacity-80 transition-opacity",
        },
      }}
    />
  );
}
