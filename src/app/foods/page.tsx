import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { loadAllFoods, loadPicker } from "@/lib/foods-data";
import { FoodsManager } from "./foods-manager";

export default async function FoodsPage() {
  await connection();
  const { supabase, profile } = await requireUser();
  if (!profile.onboarded_at) redirect("/onboarding");
  const [all, { meals }] = await Promise.all([loadAllFoods(supabase), loadPicker(supabase)]);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-5 pb-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Foods & meals</h1>
        <Link className="btn btn-ghost" href="/">Done</Link>
      </header>
      <FoodsManager
        foods={all}
        meals={meals}
        required={{ protein: profile.require_protein, fat: profile.require_fat, carbs: profile.require_carbs }}
      />
    </main>
  );
}
