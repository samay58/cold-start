import { z } from "zod";

export const companyDescriptionSchema = z.object({
  shortDescription: z.string().min(1),
  concept: z.string().min(1).nullable(),
  serves: z.string().min(1).nullable(),
  mechanism: z.string().min(1).nullable()
});

export type CompanyDescription = z.infer<typeof companyDescriptionSchema>;

