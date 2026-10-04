import type { UserInputParams, UserInputResponse } from '../userInput';
/**
 * Codex Permission Handler
 *
 * Handles tool permission requests and responses for Codex sessions.
 * Extends BasePermissionHandler with Codex-specific configuration.
 */

import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import type { AgentState } from "@/api/types";
import {
    BasePermissionHandler,
    PermissionResult,
    PendingRequest
} from '@/utils/BasePermissionHandler';

// Re-export types for backwards compatibility
export type { PermissionResult, PendingRequest };

/**
 * Codex-specific permission handler.
 */
export class CodexPermissionHandler extends BasePermissionHandler {
    // Exact tool names that should always be auto-approved. Include the bare
    // form (used by Codex elicitation messages like `tool "change_title"`)
    // and the MCP-qualified form for defense in depth.
    private static readonly ALWAYS_AUTO_APPROVE_NAMES: ReadonlySet<string> = new Set([
        'change_title',
        'mcp__happy__change_title',
    ]);

    // Tool-call IDs that should auto-approve when they exactly match one of
    // these values or start with `<name>-` (e.g. `change_title-1765385846663`).
    // Substring matching was a bypass vector — any tool whose ID happened to
    // contain `change_title` as a substring would be silently approved.
    private static readonly ALWAYS_AUTO_APPROVE_ID_PREFIXES: readonly string[] = [
        'change_title',
    ];

    constructor(session: ApiSessionClient) {
        super(session);
    }

    protected getLogPrefix(): string {
        return '[Codex]';
    }

    resetForTurn(): void {
        this.reset('Turn completed', ['AskUserQuestion']);
    }

    async handleUserInput(params: UserInputParams, signal: AbortSignal): Promise<UserInputResponse> {
        if (signal.aborted) return { answers: {} };
        const cancel = () => {
            const pending = this.pendingRequests.get(params.callId);
            if (!pending) return;
            this.pendingRequests.delete(params.callId);
            pending.resolve({ decision: 'abort' });
            this.session.updateAgentState(state => {
                const request = state.requests?.[params.callId];
                if (!request) return state;
                const { [params.callId]: _, ...requests } = state.requests || {};
                return { ...state, requests, completedRequests: {
                    ...state.completedRequests,
                    [params.callId]: { ...request, status: 'canceled', completedAt: Date.now() },
                }};
            });
        };
        const pending = this.handleToolCall(params.callId, 'AskUserQuestion', {
            provider: 'codex',
            questions: params.questions.map(question => ({ ...question, options: question.options ?? [] })),
        });
        signal.addEventListener('abort', cancel, {once: true});
        try {
            const result = await pending;
            if (result.decision !== 'approved') return {answers: {}};
            const answers = result.updatedInput?.answers;
            if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {answers: {}};
            return {answers: Object.fromEntries(params.questions.flatMap(question => {
                const value = Object.hasOwn(answers, question.id) ? (answers as Record<string, unknown>)[question.id] : undefined;
                return typeof value === 'string' && value.trim().length > 0
                    ? [[question.id, {answers: [value]}]] : [];
            }))};
        } catch {
            return {answers: {}};
        } finally {
            signal.removeEventListener('abort', cancel);
        }
    }

    private shouldAutoApprove(toolName: string, toolCallId: string): boolean {
        if (CodexPermissionHandler.ALWAYS_AUTO_APPROVE_NAMES.has(toolName)) {
            return true;
        }

        const toolCallIdSegments = toolCallId.split(':');

        for (const prefix of CodexPermissionHandler.ALWAYS_AUTO_APPROVE_ID_PREFIXES) {
            if (
                toolCallIdSegments.some((segment) => (
                    segment === prefix || segment.startsWith(`${prefix}-`)
                ))
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Handle a tool permission request
     * @param toolCallId - The unique ID of the tool call
     * @param toolName - The name of the tool being called
     * @param input - The input parameters for the tool
     * @returns Promise resolving to permission result
     */
    async handleToolCall(
        toolCallId: string,
        toolName: string,
        input: unknown
    ): Promise<PermissionResult> {
        if (toolName !== 'AskUserQuestion' && this.shouldAutoApprove(toolName, toolCallId)) {
            logger.debug(`${this.getLogPrefix()} Auto-approving tool ${toolName} (${toolCallId})`);

            this.session.updateAgentState((currentState) => ({
                ...currentState,
                completedRequests: {
                    ...currentState.completedRequests,
                    [toolCallId]: {
                        tool: toolName,
                        arguments: input,
                        createdAt: Date.now(),
                        completedAt: Date.now(),
                        status: 'approved',
                        decision: 'approved',
                    },
                },
            } satisfies AgentState));

            return { decision: 'approved' };
        }

        return new Promise<PermissionResult>((resolve, reject) => {
            // Store the pending request
            this.pendingRequests.set(toolCallId, {
                resolve,
                reject,
                toolName,
                input
            });

            // Update agent state with pending request
            this.addPendingRequestToState(toolCallId, toolName, input);

            logger.debug(`${this.getLogPrefix()} Permission request sent for tool: ${toolName} (${toolCallId})`);
        });
    }
}
