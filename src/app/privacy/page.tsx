export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground">
        We value your privacy. This policy explains what information we
        collect, how we use it, and your choices.
      </p>
      <section className="space-y-2">
        <h2 className="text-xl font-medium">Information We Collect</h2>
        <p className="text-muted-foreground">
          We may collect account and usage information to provide and improve
          our services.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-medium">How We Use Information</h2>
        <p className="text-muted-foreground">
          Information is used for authentication, personalization, and to
          enhance the product experience.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-medium">Your Choices</h2>
        <p className="text-muted-foreground">
          You may request data access or deletion subject to applicable laws.
        </p>
      </section>
    </div>
  );
}

