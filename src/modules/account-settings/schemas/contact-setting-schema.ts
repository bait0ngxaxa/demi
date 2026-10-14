import { z } from "zod";

export const contactEmailSchema = z.union([z.string().trim().max(320).email(), z.literal("")]).transform((value) => value || null);
export const updateContactEmailSchema = z.object({ email: contactEmailSchema, expectedVersion: z.number().int().min(0).max(2_147_483_646) }).strict();
export type ContactEmailInput = z.infer<typeof updateContactEmailSchema>;
