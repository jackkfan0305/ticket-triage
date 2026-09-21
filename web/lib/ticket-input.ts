import { z } from "zod";

/** What either classify route accepts as one ticket. Shared so the single
 *  ticket and the floor's run reject the same input for the same reasons. */
export const TicketInput = z.object({
  subject: z.string().max(200, "Subject must be 200 characters or fewer.").default(""),
  body: z
    .string()
    .max(5000, "Body must be 5000 characters or fewer.")
    .refine((v) => v.trim().length > 0, "Body is required."),
});
