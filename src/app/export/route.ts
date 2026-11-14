import { requireUser } from "@/lib/session";
import { todayFor } from "@/lib/profile";
import { buildExport } from "@/lib/export-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, profile } = await requireUser();
  const { zip } = await buildExport(supabase, profile.user_id);
  return new Response(zip as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="fitness-export-${todayFor(profile)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
