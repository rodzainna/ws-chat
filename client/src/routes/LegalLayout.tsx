import type { ReactNode } from "react";
import { Link } from "react-router";

// set at build time so the address stays out of the repo
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL;
const LAST_UPDATED = "October 7, 2026";

export function LegalLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-svh bg-muted/30 px-4 py-10">
      <article className="mx-auto max-w-2xl space-y-6 rounded-xl border bg-card p-6 text-sm leading-relaxed text-card-foreground sm:p-10">
        <Link to="/login" className="text-muted-foreground hover:underline">
          ← Back to ws-chat
        </Link>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">Last updated {LAST_UPDATED}</p>
        </header>
        {children}
      </article>
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{heading}</h2>
      {children}
    </section>
  );
}

export function ContactLink() {
  if (!CONTACT_EMAIL) return <>the site owner</>;
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
      {CONTACT_EMAIL}
    </a>
  );
}
