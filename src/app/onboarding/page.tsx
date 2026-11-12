import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  await connection();
  const { profile } = await requireUser();
  if (profile.onboarded_at) redirect("/");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Set up your targets</h1>
      <p className="text-muted">Takes a minute. You can change all of this later in Settings.</p>
      <OnboardingForm proteinRule={profile.protein_rule} proteinValue={profile.protein_value} />
    </main>
  );
}
