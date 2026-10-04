import { describe, expect, it, vi } from 'vitest';
import { CodexPermissionHandler } from '../utils/permissionHandler';
vi.mock('@/ui/logger', () => ({ logger: { debug: vi.fn() } }));
const params = {callId:'change_title:question:1',threadId:'t',turnId:'u',itemId:'i',isBlocking:false,
 questions:[{id:'a',header:'A',question:'Same text',options:[{label:'Yes, please',description:''}]},{id:'b',header:'B',question:'Same text',isSecret:true}]};
function setup() {
 let state:any={}; let rpc:any;
 const handler=new CodexPermissionHandler({rpcHandlerManager:{registerHandler:(_n:any,h:any)=>{rpc=h;}},updateAgentState:(fn:any)=>{state=fn(state);}} as any);
 return {handler,state:()=>state,answer:(answers:any)=>rpc({id:params.callId,approved:true,updatedInput:{answers}})};
}
describe('Codex question answers',()=>{
 it('publishes a dialog and returns ID-keyed answers without splitting commas or storing secrets',async()=>{
  const s=setup(); const pending=s.handler.handleUserInput(params,new AbortController().signal);
  expect(s.state().requests[params.callId].tool).toBe('AskUserQuestion');
  await s.answer({a:'Yes, please',b:'private answer',unknown:'ignored'});
  expect(await pending).toEqual({answers:{a:{answers:['Yes, please']},b:{answers:['private answer']}}});
  expect(JSON.stringify(s.state())).not.toContain('private answer');
 });
 it('keeps asynchronous questions through turn completion',async()=>{
  const s=setup();const pending=s.handler.handleUserInput(params,new AbortController().signal);
  s.handler.resetForTurn(); expect(s.state().requests[params.callId]).toBeDefined();
  await s.answer({a:'Yes, please'});expect(await pending).toEqual({answers:{a:{answers:['Yes, please']}}});
 });
 it('cancels only the resolved server request',async()=>{
  const s=setup();const controller=new AbortController();const pending=s.handler.handleUserInput(params,controller.signal);
  const other=s.handler.handleToolCall('command','Bash',{});
  controller.abort();expect(await pending).toEqual({answers:{}});
  expect(s.state().requests.command).toBeDefined();expect(s.state().completedRequests[params.callId].status).toBe('canceled');
  s.handler.abortAll();await other;
 });
 it('returns no invented answers on stop or session reset',async()=>{
  for(const action of ['abortAll','reset'] as const){const s=setup();const pending=s.handler.handleUserInput(params,new AbortController().signal);s.handler[action]();expect(await pending).toEqual({answers:{}});}
 });
 it('does not publish an already canceled request',async()=>{
  const s=setup();const c=new AbortController();c.abort();expect(await s.handler.handleUserInput(params,c.signal)).toEqual({answers:{}});expect(s.state().requests).toBeUndefined();
 });
});
