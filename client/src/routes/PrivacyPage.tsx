import { Link } from "react-router";
import { ContactLink, LegalLayout, LegalSection } from "@/routes/LegalLayout";

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        ws-chat is a portfolio demo built and run by Rodzainna Hamisain. It
        collects only what it needs to work. Please treat it as a public demo:
        use a throwaway email and don't post anything private.
      </p>

      <LegalSection heading="What's collected">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your username and email address</li>
          <li>Your password, stored only as a bcrypt hash</li>
          <li>
            Messages you send (including edits), rooms you create or join, and
            @mentions
          </li>
          <li>Session records used to keep you logged in</li>
        </ul>
        <p>
          Your IP address is used briefly in server memory to rate-limit
          sign-ups and logins. It isn't saved to the database.
        </p>
      </LegalSection>

      <LegalSection heading="Who can see it">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Members of a room can see your username, your messages in that room,
            and whether you're online.
          </li>
          <li>
            Admins can see your email, and can change roles, deactivate
            accounts, and remove messages or rooms.
          </li>
          <li>
            The demo admin account's password is public, so anyone can log in as
            an admin. Assume anything you post or enter here may be seen.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Cookies and tracking">
        <p>
          ws-chat uses two httpOnly cookies to keep you logged in: a short-lived
          access token and a refresh token that expires after a few days. There
          are no analytics, ads, or third-party trackers.
        </p>
      </LegalSection>

      <LegalSection heading="Where it's stored">
        <p>
          The app is hosted on Render and the database on Supabase. Your data is
          never sold or shared with anyone else.
        </p>
      </LegalSection>

      <LegalSection heading="How long it's kept">
        <p>
          Deleted messages and rooms are hidden but stay in the database, so
          earlier conversations still make sense. There's no account deletion
          feature. If you want your account deactivated, email <ContactLink />.
          Requests are handled by hand, on a best-effort basis. The demo may
          also be reset or shut down at any time, and that wipes all data.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          For questions or deactivation requests, email <ContactLink />. See
          also the{" "}
          <Link to="/terms" className="underline">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
