import { z } from "zod";

export const userOwnedPasswordSchema = z.string().min(12).max(128);

export type UserOwnedPassword = z.infer<typeof userOwnedPasswordSchema>;
