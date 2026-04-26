import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <SignIn
      appearance={{
        elements: {
          rootBox: "mx-auto",
          card: "bg-background border border-border shadow-lg",
          headerTitle: "text-foreground",
          headerSubtitle: "text-muted-foreground",
          socialButtonsBlockButton: "bg-muted border border-border text-foreground hover:bg-accent",
          formFieldInput: "bg-background border-border text-foreground",
          formButtonPrimary: "bg-primary text-primary-foreground hover:opacity-90",
          footerActionLink: "text-primary hover:text-primary/80",
        },
      }}
    />
  );
}
