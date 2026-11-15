import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy policy · Fitness Tracker" };

const UPDATED = "November 14, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">{children}</ul>
    </section>
  );
}

/** Public: linked from sign-in, Settings, and third-party app registrations (e.g. WHOOP). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-6 pb-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Privacy policy</h1>
        <p className="text-sm text-muted">Fitness Tracker · last updated {UPDATED}</p>
      </header>
      <p className="text-sm">
        Fitness Tracker is a private, invite-only food and fitness log run by a small group of friends for themselves.
        It is not a commercial service and has no ads.
      </p>

      <Section title="What we store">
        <li>Your email address (from Google sign-in).</li>
        <li>The settings and body stats you enter: sex, birth date, height, activity level, goal, units, time zone.</li>
        <li>What you log: food entries and notes, saved foods and meals, weigh-ins, workouts and your daily targets.</li>
        <li>If you connect a fitness tracker (for example WHOOP): the daily calories burned and workouts it shares, plus the access token needed to fetch them.</li>
      </Section>

      <Section title="Who can see it">
        <li>Only you can read your log. Other users can&apos;t, and the database enforces this for every request.</li>
        <li>The admin page shows only emails and sign-up/last-active dates, never anyone&apos;s food, weight or workouts.</li>
        <li>The people who run the app don&apos;t look at your logs. Like any web service, the servers it runs on could technically see data passing through.</li>
        <li>We never sell or share your data, and there are no ads, analytics or tracking scripts.</li>
      </Section>

      <Section title="Connected apps">
        <li><span className="font-medium">Claude:</span> only if you connect it. It can log and read your own entries and correct one; it can&apos;t delete anything or change your settings. Disconnect any time in Settings.</li>
        <li><span className="font-medium">WHOOP and other trackers:</span> only if you connect them. We request read-only access to daily calories burned and workouts, and nothing else. We never write to your tracker. Disconnecting deletes the stored access token.</li>
      </Section>

      <Section title="Where it&apos;s kept">
        <li>Data is stored with Supabase (database and sign-in) and served by Vercel (and later our own server).</li>
        <li>An encrypted backup is made daily; each copy is deleted after 30 days.</li>
      </Section>

      <Section title="Your choices">
        <li><span className="font-medium">Export:</span> Settings → Export all downloads everything you&apos;ve logged.</li>
        <li><span className="font-medium">Delete:</span> Settings → Delete account removes your login and all your data immediately. Backups holding it age out within 30 days.</li>
        <li><span className="font-medium">Questions:</span> ask the person who invited you.</li>
      </Section>

      <Link className="btn btn-ghost" href="/">Back to Fitness Tracker</Link>
    </main>
  );
}
