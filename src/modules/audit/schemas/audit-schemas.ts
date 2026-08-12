import { z } from "zod";

const auditMetadataValueSchema = z.union([z.string().max(256), z.number(), z.boolean(), z.null()]);

export const auditMetadataSchema = z
  .record(z.string().trim().min(1).max(80), auditMetadataValueSchema)
  .superRefine((metadata, context) => {
    const sensitiveKeyPattern = /(password|token|secret|authorization|national.?id|phone|email)/i;
    const entries = Object.entries(metadata);

    if (entries.length > 20) {
      context.addIssue({
        code: "custom",
        message: "Audit metadata contains too many fields",
      });
    }

    for (const [key] of entries) {
      if (sensitiveKeyPattern.test(key)) {
        context.addIssue({
          code: "custom",
          message: "Sensitive values must not be written to audit metadata",
        });
        break;
      }
    }
  });

export const auditEventInputSchema = z
  .object({
    actorUserId: z.string().uuid().nullable(),
    action: z.string().trim().min(1).max(120),
    resourceType: z.string().trim().min(1).max(120),
    resourceId: z.string().trim().min(1).max(255).optional(),
    metadata: auditMetadataSchema.optional(),
  })
  .strict();

export type AuditEventInput = z.infer<typeof auditEventInputSchema>;
