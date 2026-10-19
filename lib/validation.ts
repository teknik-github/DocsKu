import { z } from "zod";

export type FormState =
  | {
      error?: string;
      success?: string;
      fieldErrors?: Record<string, string>;
      /** Submitted values (never passwords), so fields refill after React resets the form. */
      values?: Record<string, string>;
    }
  | undefined;

/** Non-secret text fields from a form submission. */
export function keepValues(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

export const passwordSchema = z.string().min(10, "Minimal 10 karakter.").max(200, "Terlalu panjang.");

/** First error message per field, for showing under inputs. */
export function fieldErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Trimmed, lowercased, then checked as an email. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Email tidak valid."));
