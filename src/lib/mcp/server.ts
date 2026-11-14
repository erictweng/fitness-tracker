import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MEALS } from "@/lib/domain/day";
import { editEntry, getDay, listRecentFoods, logFood, logWeight, logWorkout, ToolError, type Ctx } from "./tools";

const INSTRUCTIONS = `Fitness Tracker: the user's private food, weight and workout log.
- When the user says what they ate, estimate calories and protein (and fat/carbs when you can) and call log_food once per item. Say what you logged and the numbers you used.
- Check list_recent_foods first when the food might be one they've saved; use those numbers.
- Generate a fresh random UUID for entry_id / workout_id / weigh_in_id on every new item, and reuse the same one only when retrying the same call, so a retry never logs twice.
- Dates follow the user's day (their day ends at their day-end hour, often 3 AM); omit date for today.
- You can't delete anything or change targets or settings: tell the user to do that in the app. Fix mistakes with edit_entry.`;

const id = z.string().optional();
const date = z.string().optional().describe("YYYY-MM-DD in the user's day. Omit for today.");

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

async function run(fn: () => Promise<unknown>) {
  try {
    return result(await fn());
  } catch (e) {
    const msg = e instanceof ToolError ? e.message : "Something went wrong saving that. Try again in a moment.";
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}

export function buildServer(ctx: Ctx) {
  const server = new McpServer({ name: "fitness-tracker", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const macros = {
    kcal: z.number().describe("Calories"),
    protein_g: z.number().optional().describe("Protein in grams"),
    fat_g: z.number().optional().describe("Fat in grams. Omit if unknown (never guess 0)."),
    carbs_g: z.number().optional().describe("Carbs in grams. Omit if unknown (never guess 0)."),
  };

  server.registerTool("get_day", {
    title: "Get a day",
    description: "Totals, target, what's left, entries (with ids for edit_entry), workouts and latest weight for a day.",
    inputSchema: { date },
    annotations: { readOnlyHint: true },
  }, (a) => run(() => getDay(ctx, a)));

  server.registerTool("log_food", {
    title: "Log food",
    description: "Log one food item the user ate. Saved immediately and shown in the app as 'via Claude'.",
    inputSchema: {
      name: z.string().max(80).describe("Short name, e.g. '2 eggs, scrambled'"),
      ...macros,
      meal: z.enum(MEALS as [string, ...string[]]).optional().describe("Defaults to the meal for the current time."),
      date,
      notes: z.string().max(280).optional().describe("Optional: portion details, assumptions."),
      entry_id: id.describe("New random UUID per item; reuse only when retrying."),
      confirm_large: z.boolean().optional().describe("Only after the user confirms an entry over 5,000 kcal."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (a) => run(() => logFood(ctx, a)));

  server.registerTool("edit_entry", {
    title: "Edit a food entry",
    description: "Correct an existing entry (id from get_day). Only the fields you pass change. Can't delete.",
    inputSchema: {
      entry_id: z.string().describe("The entry's id from get_day"),
      name: z.string().max(80).optional(),
      kcal: z.number().optional(),
      protein_g: z.number().optional(),
      fat_g: z.number().optional(),
      carbs_g: z.number().optional(),
      meal: z.enum(MEALS as [string, ...string[]]).optional(),
      date,
      notes: z.string().max(280).optional(),
      confirm_large: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (a) => run(() => editEntry(ctx, a)));

  server.registerTool("log_weight", {
    title: "Log weight",
    description: "Log a weigh-in. One per day: a second one that day replaces it.",
    inputSchema: {
      weight: z.number(),
      unit: z.enum(["lb", "kg"]).optional().describe("Defaults to the user's unit (see get_day settings)."),
      date,
      weigh_in_id: id.describe("New random UUID; reuse only when retrying."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (a) => run(() => logWeight(ctx, a)));

  server.registerTool("log_workout", {
    title: "Log workout",
    description: "Log a workout. Burned calories are shown for context and never raise the calorie target.",
    inputSchema: {
      type: z.string().max(60).describe("e.g. 'Push day', '5k run'"),
      minutes: z.number().int().describe("1–600"),
      kcal: z.number().int().optional().describe("Calories burned, 0–3000, if known"),
      notes: z.string().max(280).optional(),
      date,
      workout_id: id.describe("New random UUID; reuse only when retrying."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, (a) => run(() => logWorkout(ctx, a)));

  server.registerTool("list_recent_foods", {
    title: "List saved foods",
    description: "The user's saved foods (recently used first) and saved meals, with per-serving numbers.",
    inputSchema: { limit: z.number().int().optional() },
    annotations: { readOnlyHint: true },
  }, (a) => run(() => listRecentFoods(ctx, a)));

  return server;
}
