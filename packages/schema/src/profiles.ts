import { z } from 'zod';

/** POST /profiles response body, create an anonymous profile (plan §8, §9.2). */
export const postProfilesResponseSchema = z.object({
  id: z.uuid(),
});

export type PostProfilesResponse = z.infer<typeof postProfilesResponseSchema>;
