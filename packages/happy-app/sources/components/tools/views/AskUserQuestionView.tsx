import * as React from 'react';

import { sessionAllow } from '@/sync/ops';
import { ToolViewProps } from './_all';
import {
    InlineQuestionForm,
    type InlineQuestion,
    type InlineQuestionAnswers,
} from './InlineQuestionForm';

interface AskUserQuestionInput {
    provider?: string;
    questions?: Array<{
        id?: string;
        isOther?: boolean;
        isSecret?: boolean;
        question: string;
        header: string;
        options: Array<{ label: string; description?: string }>;
        multiSelect?: boolean;
    }>;
}

export const AskUserQuestionView = React.memo<ToolViewProps>(({ tool, sessionId }) => {
    const input = tool.input as AskUserQuestionInput | undefined;
    const questions = React.useMemo<InlineQuestion[]>(() => (
        (input?.questions ?? []).map((question, index) => ({
            ...question,
            id: input?.provider === 'codex' ? question.id ?? `question-${index}` : `question-${index}`,
            multiSelect: input?.provider === 'codex' ? false : question.multiSelect,
            allowTextAnswer: input?.provider === 'codex' && (question.isOther === true || question.options.length === 0),
            isSecret: input?.provider === 'codex' && question.isSecret === true,
            required: true,
        }))
    ), [input?.provider, input?.questions]);

    const handleSubmit = React.useCallback(async (answers: InlineQuestionAnswers) => {
        if (!sessionId || !tool.permission?.id) return;

        const providerAnswers: Record<string, string> = Object.create(null);
        questions.forEach((question, index) => {
            const originalQuestion = input?.questions?.[index];
            const selected = answers[question.id];
            if (originalQuestion && selected?.length) {
                const key = input?.provider === 'codex' ? question.id : originalQuestion.question;
                providerAnswers[key] = input?.provider === 'codex' ? selected[0] : selected.join(', ');
            }
        });

        // Both providers resolve this dialog through the permission callback.
        await sessionAllow(
            sessionId,
            tool.permission.id,
            undefined,
            undefined,
            'approved',
            { answers: providerAnswers },
        );
    }, [input?.provider, input?.questions, questions, sessionId, tool.permission?.id]);

    if (questions.length === 0) return null;

    const isCodex = input?.provider === 'codex';
    const permissionResolved = isCodex && tool.permission != null && tool.permission.status !== 'pending';

    return (
        <InlineQuestionForm
            questions={questions}
            canInteract={tool.state === 'running' && (!isCodex || tool.permission?.status === 'pending')}
            submittedAnswers={tool.state === 'completed' || permissionResolved ? Object.create(null) : undefined}
            onSubmit={handleSubmit}
        />
    );
});
