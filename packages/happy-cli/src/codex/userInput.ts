import { z } from 'zod';

export const userInputParamsSchema = z.object({
    threadId: z.string(), turnId: z.string(), itemId: z.string(),
    isBlocking: z.boolean().default(true),
    questions: z.array(z.object({
        id: z.string(), header: z.string(), question: z.string(),
        options: z.array(z.object({label: z.string(), description: z.string()})).nullish(),
        isOther: z.boolean().optional(), isSecret: z.boolean().optional(),
    })).min(1),
});
export type UserInputParams = z.infer<typeof userInputParamsSchema> & {callId: string};
export type UserInputResponse = {answers: Record<string, {answers: string[]}>};
export type UserInputHandler = (params: UserInputParams, signal: AbortSignal) => Promise<UserInputResponse>;
