import { describe, expect, it } from 'vitest';
import { createReducer, reducer } from './reducer';

describe('Codex question permission completion', () => {
    it.each([
        { tool: 'AskUserQuestion', arguments: { provider: 'codex', questions: [] }, expected: 'completed' },
        { tool: 'AskUserQuestion', arguments: { questions: [] }, expected: 'running' },
        { tool: 'Bash', arguments: { provider: 'codex', command: 'pwd' }, expected: 'running' },
    ])('transitions $tool with $arguments to $expected on approval', ({ tool, arguments: args, expected }) => {
        const state = createReducer();
        const request = { tool, arguments: args, createdAt: 1000 };
        reducer(state, [], { requests: { question: request } });
        const result = reducer(state, [], { completedRequests: { question: {
            ...request, status: 'approved', completedAt: 2000,
        } } });
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]).toMatchObject({
            kind: 'tool-call', tool: { state: expected, permission: { status: 'approved' } },
        });
        if (expected === 'completed') {
            expect(result.messages[0]).toMatchObject({ tool: { completedAt: 2000 } });
        }
    });
});
