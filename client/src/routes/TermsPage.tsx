import { Link } from "react-router";
import { ContactLink, LegalLayout, LegalSection } from "@/routes/LegalLayout";

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        ws-chat is a portfolio demo built and run by Rodzainna Hamisain. By
        creating an account or using a demo account, you agree to these terms.
      </p>

      <LegalSection heading="It's a demo">
        <p>
          ws-chat is provided as-is, for free, with no guarantees. It runs on a
          free hosting tier, so it may be slow to wake up or go down. The
          database may be wiped and reseeded at any time, as often as once a
          month, which deletes all accounts and messages created since. The
          service may also shut down at any time without notice. Don't rely on
          it for anything important.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>Don't use ws-chat to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>harass, threaten, or abuse other people</li>
          <li>post spam or illegal, hateful, or sexually explicit content</li>
          <li>share other people's personal information</li>
          <li>
            attack, overload, or try to break into the service beyond normal use
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          You're responsible for what you post. Admins may remove content or
          deactivate accounts at their discretion, and anyone using the public
          demo admin account can see and moderate content.
        </p>
      </LegalSection>

      <LegalSection heading="Liability">
        <p>
          To the extent the law allows, Rodzainna Hamisain isn't liable for any
          loss or damage that comes from using ws-chat.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and contact">
        <p>
          These terms may change, and the date at the top will show when.
          Questions go to <ContactLink />. How data is handled is described in
          the{" "}
          <Link to="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
