export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <p className="text-muted-foreground">
        These Terms govern your use of our application. By accessing or using
        the service, you agree to be bound by these Terms.
      </p>
      <section className="space-y-2">
        <h2 className="text-xl font-medium">Use of Service</h2>
        <p className="text-muted-foreground">
          You agree to use the service in compliance with applicable laws and
          not to misuse or attempt to disrupt the platform.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-medium">Accounts</h2>
        <p className="text-muted-foreground">
          You are responsible for maintaining the confidentiality of your
          account and for all activities under your account.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-medium">Changes</h2>
        <p className="text-muted-foreground">
          We may update these Terms from time to time. Continued use of the
          service constitutes acceptance of the updated Terms.
        </p>
      </section>
    </div>
  );
}
