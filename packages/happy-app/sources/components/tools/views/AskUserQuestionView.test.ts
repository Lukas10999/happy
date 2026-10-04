import * as React from 'react';
// @ts-expect-error react-test-renderer has no declarations in this workspace.
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { allow } = vi.hoisted(() => ({ allow: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/sync/ops', () => ({ sessionAllow: allow }));
vi.mock('@/text', () => ({ t: (key: string) => key }));
vi.mock('react-native', () => ({
    View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput',
    ActivityIndicator: 'ActivityIndicator', Platform: { select: (value: any) => value.web },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('react-native-unistyles', () => ({
    StyleSheet: { create: () => ({}) },
    useUnistyles: () => ({ theme: { colors: { button: { primary: { tint: '#fff' } } } } }),
}));
vi.mock('../ToolSectionView', () => ({ ToolSectionView: 'ToolSectionView' }));
import { AskUserQuestionView } from './AskUserQuestionView';

let tree: ReturnType<typeof create>;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); allow.mockClear(); });
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllGlobals(); });
const question = { id: 'stable-id', question: 'Which approach?', header: 'Approach', options: [{ label: 'One, with commas' }, { label: 'Two' }] };
function render(questions: any[], provider?: string, status: string = 'pending') {
    act(() => { tree = create(React.createElement(AskUserQuestionView, {
        sessionId: 'session', tool: { input: { provider, questions }, state: 'running', permission: { id: 'request', status } },
    } as any)); });
}
function buttons() { return tree.root.findAllByType('TouchableOpacity'); }
async function submit() { await act(async () => { await buttons().at(-1).props.onPress(); }); }

describe('AskUserQuestion permission dialog', () => {
    it('sends Codex answers by stable ID and preserves commas in a single option', async () => {
        render([question], 'codex');
        act(() => buttons()[0].props.onPress());
        await submit();
        expect(allow).toHaveBeenCalledWith('session', 'request', undefined, undefined, 'approved', { answers: { 'stable-id': 'One, with commas' } });
    });
    it('preserves a question ID that matches an object prototype property', async () => {
        render([{ ...question, id: '__proto__' }], 'codex');
        act(() => buttons()[0].props.onPress());
        await submit();
        expect(JSON.stringify(allow.mock.calls[0][5])).toBe('{"answers":{"__proto__":"One, with commas"}}');
    });
    it('accepts free text for a prototype-property question ID', async () => {
        render([{ ...question, id: '__proto__', options: [] }], 'codex');
        act(() => tree.root.findByType('TextInput').props.onChangeText('Free answer'));
        await submit();
        expect(JSON.stringify(allow.mock.calls[0][5])).toBe('{"answers":{"__proto__":"Free answer"}}');
    });
    it.each(['approved', 'denied', 'canceled'])('does not reopen a resolved Codex dialog when remounted (%s)', (status) => {
        render([question], 'codex', status);
        expect(buttons()).toHaveLength(0);
        expect(tree.root.findAllByType('TextInput')).toHaveLength(0);
        expect(allow).not.toHaveBeenCalled();
    });
    it.each(['__proto__', 'constructor'])('renders an approved question with prototype-property ID %s', (id) => {
        render([{ ...question, id }], 'codex', 'approved');
        expect(buttons()).toHaveLength(0);
        expect(JSON.stringify(tree.toJSON())).toContain('—');
    });
    it('retains Claude question-text keys and multiple selections', async () => {
        render([{ ...question, multiSelect: true }]);
        act(() => buttons()[0].props.onPress());
        act(() => buttons()[1].props.onPress());
        await submit();
        expect(allow.mock.calls[0][5]).toEqual({ answers: { 'Which approach?': 'One, with commas, Two' } });
    });
    it('forces Codex single selection even if multiSelect is present', async () => {
        render([{ ...question, multiSelect: true }], 'codex');
        act(() => buttons()[0].props.onPress());
        act(() => buttons()[1].props.onPress());
        await submit();
        expect(allow.mock.calls[0][5]).toEqual({ answers: { 'stable-id': 'Two' } });
    });
    it('accepts free text without options, masks secret entry, and redacts its submitted value', async () => {
        render([{ ...question, options: [], isSecret: true }], 'codex');
        expect(buttons().at(-1).props.disabled).toBe(true);
        const input = tree.root.findByType('TextInput');
        expect(input.props.secureTextEntry).toBe(true);
        act(() => input.props.onChangeText('private answer'));
        expect(buttons().at(-1).props.disabled).toBe(false);
        await submit();
        expect(allow.mock.calls[0][5]).toEqual({ answers: { 'stable-id': 'private answer' } });
        expect(JSON.stringify(tree.toJSON())).not.toContain('private answer');
    });
    it('allows custom text instead of an option', async () => {
        render([{ ...question, isOther: true }], 'codex');
        act(() => buttons()[0].props.onPress());
        act(() => tree.root.findByType('TextInput').props.onChangeText('Custom, answer'));
        await submit();
        expect(allow.mock.calls[0][5]).toEqual({ answers: { 'stable-id': 'Custom, answer' } });
    });
    it('uses the selected option after switching away from custom text', async () => {
        render([{ ...question, isOther: true }], 'codex');
        act(() => tree.root.findByType('TextInput').props.onChangeText('Custom'));
        act(() => buttons()[1].props.onPress());
        await submit();
        expect(allow.mock.calls[0][5]).toEqual({ answers: { 'stable-id': 'Two' } });
    });
    it('does not add text fields to Claude dialogs or Codex fixed choices', () => {
        render([question]);
        expect(tree.root.findAllByType('TextInput')).toHaveLength(0);
        act(() => tree.unmount());
        render([question], 'codex');
        expect(tree.root.findAllByType('TextInput')).toHaveLength(0);
    });
});
