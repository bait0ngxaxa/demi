import { z } from "zod";

export const loginInputSchema = z
  .object({
    email: z.string().trim().max(254).pipe(z.email()),
    password: z.string().min(1).max(128),
  })
  .strict();

export type LoginInput = z.infer<typeof loginInputSchema>;
