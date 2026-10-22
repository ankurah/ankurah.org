// Content and route decisions are separate from the browser presentation.
// Examples describe the memory-first digest synchronization branch, not released main.
export const selection = "project = 'acme'";
const spec = "TreeSpec { predicate: project = 'acme', key_spec: [project: String] }";
const span = 'TreeSpan::full()';
const head = (id, clock) => `{ key: Kacme, entity: { entity_id: ${id}, head: ${clock} } }`;
const wire = (direction, label, type, reply, body, progress = '') => ({ direction, label, type, reply, body, progress });
const request = (name, body, reply = 'NodeResponseBody::Success') => wire('right', name, `NodeMessage::Request → NodeRequestBody::${name}`, reply, body);
const response = (body, progress) => wire('left', 'Fetch response · frame 0', 'NodeMessage::Response → NodeResponseBody::Fetch(StateReply)', 'None. This answers the original Fetch request.', body.startsWith('Fetch(') ? body : `Fetch(StateReply {\n  spec, round: { number: 0, revision: 100 },\n  frame: ${body}\n})`, progress);
const pushed = (label, body, progress = '') => wire('left', label, 'NodeMessage::Update → NodeUpdateBody::StateFrame', 'NodeMessage::UpdateAck → NodeUpdateAckBody::Success (routing receipt)', body, progress);
const ack = () => wire('right', 'UpdateAck', 'NodeMessage::UpdateAck', 'None.', 'NodeUpdateAck { id: update_id, body: Success }');
const success = () => wire('left', 'Success', 'NodeMessage::Response → NodeResponseBody::Success', 'None.', 'NodeResponse { request_id: control_request_id, body: Success }');
const stateBody = (items, progress, sequence = 0) => `StateFrame {\n  stream: S1, sequence: ${sequence},\n  body: State { round: 0,\n    items: ${items},\n    progress: ${progress}\n  }\n}`;
const feedback = answers => request('ContinueState', `ContinueState {\n  stream: S1, round: Some(0),\n  processed_through: last_processed_sequence,\n  applied_through: None,\n  answers: ${answers}\n}`);
export function knownState(local) {
  const content = local === 'many'
    ? 'Digest(TreeSpanDigest { prefix: P1, bounds: R1, digest: D1 }),\n    Digest(TreeSpanDigest { prefix: P2, bounds: R2, digest: D2 }), …'
    : `Heads(TreeSpanInventory {\n      bounds: ${span},\n      heads: packed [${local === 'few' ? '\n        '+head('A','HA')+',\n        '+head('B','HB')+'\n      ' : ''}]\n    })`;
  return `KnownState {\n  spec: ${spec},\n  spans: [${content}]\n}`;
}
export function defaults(lesson = 'fetch') { return {lesson, local:'none', cache:'miss', difference:'large', repair:false, step:lesson === 'live' ? 'subscribe' : 'lookup'}; }
export function route(state) {
  if (state.lesson === 'live') return ['subscribe','overlap','publish','complete-live','ready-live','refresh','close'];
  const steps = ['lookup','local','offer','request','compare'];
  if (state.local === 'many') {
    if (state.difference === 'equal') return [...steps,'equal','ready','finish'];
    if (state.difference === 'large') steps.push('refine');
    steps.push('heads');
  }
  steps.push('transfer','apply');
  if (state.repair) steps.push('repair');
  return [...steps,'ready','finish'];
}
export function parseState(hash, lesson = 'fetch') {
  const values = new URLSearchParams(hash.replace(/^#/,''));
  const state = defaults(lesson);
  if (['hit','miss'].includes(values.get('cache'))) state.cache = values.get('cache');
  if (['none','few','many'].includes(values.get('local'))) state.local = values.get('local');
  if (['equal','small','large'].includes(values.get('difference'))) state.difference = values.get('difference');
  state.repair = values.get('repair') === 'yes';
  const steps = route(state);
  if (steps.includes(values.get('step'))) state.step = values.get('step');
  return state;
}
export function hashFor(state) {
  const values = new URLSearchParams({step:state.step});
  if (state.lesson !== 'live') { values.set('cache',state.cache); values.set('local',state.local); values.set('difference',state.difference); if (state.repair) values.set('repair','yes'); }
  return '#'+values;
}
export const titles = {
  lookup:'Look for a cached tree', local:'Capture local matches', offer:'Prepare KnownState', request:'Send Fetch', compare:'Choose the next move',
  equal:'Confirm equality', refine:'Compare smaller spans', heads:'Ask for entity heads', transfer:'Send the changes',
  apply:'Apply the state', repair:'Get connecting history', ready:'Return the result', finish:'Release the round',
  subscribe:'Subscribe once', overlap:'Let live changes through', publish:'Apply a live publication', 'complete-live':'Answer the round’s question', 'ready-live':'Finish this round', refresh:'Compare again', close:'End the stream'
};
const localOptions = [{value:'none',label:'None',detail:'0 matching entities'}, {value:'few',label:'A few',detail:'A and B'}, {value:'many',label:'Many',detail:'4,096 matching entities'}];
const differenceOptions = [{value:'equal',label:'Everything agrees',detail:'Same members and heads'}, {value:'small',label:'One small span differs',detail:'32 responder rows in R'}, {value:'large',label:'One large span differs',detail:'512 responder rows in R'}];
export function page(state) {
  const many = state.local === 'many';
  const empty = state.local === 'none';
  const target = empty ? 'E' : many ? 'E' : 'C';
  const context = state.lesson === 'live' ? 'One stream · finite rounds and live changes' : empty ? 'No local matches' : many ? `Many local matches · ${state.difference === 'equal' ? 'all agree' : state.difference+' difference'}` : 'Two local matches';
  const result = { title:titles[state.step], context, paragraphs:[], messages:[], note:'', choices:null, visual:null };
  switch(state.step) {
    case 'lookup':
      result.paragraphs = ['A Fetch begins with its Selection. The node looks in its local LRU for a compatible cached tree. Cached trees are kept updated as entities change while they remain resident.', 'Choose whether this Fetch finds one. A compatible tree contains all the required members and can select the query’s range and limit using its key layout. The node also checks that access permissions allow sharing.'];
      result.choices={field:'cache',label:'Is there a compatible tree in the cache?',options:[{value:'miss',label:'No cached tree',detail:'Capture and add one'},{value:'hit',label:'Tree already cached',detail:'Use the maintained entry'}]};
      result.visual={kind:'decision',label:state.cache==='hit'?'Cache hit → reuse':'Cache miss → create',detail:'Find a tree whose TreeSpec is compatible with this Fetch’s Selection.'};
      result.note='For example, a tree covering all of project = acme AND foo > 7 can serve foo > 10 when keyed by project and foo. It cannot serve foo > 3. A tree created from a limited result initially serves only that same Selection.';
      break;
    case 'local':
      result.title=state.cache==='hit'?'Capture the cached result':'Capture local matches and add a cache entry';
      result.paragraphs = [state.cache==='hit'?'The node checks current access permissions and catches the cached tree up through a finite change boundary, then takes a stable snapshot for this Fetch. Later changes keep updating the resident entry.':'The node starts following committed changes before reading its local matches, so it cannot miss a write during capture. It reads the local result and adds a maintained tree to the cache. With no LIMIT, that tree covers the full predicate. A new limited query reads only its bounded result; the cache records that narrower coverage. Each key and causal head comes from the same entity version.', 'Choose the requester’s starting result. The predicate stays the same in every case.'];
      result.choices={field:'local',label:'How many matches does the requester already have?',options:localOptions};
      result.visual={kind:'members',left:empty?'No matching entities':many?'4,096 matching entities':'A @ HA · B @ HB',right:empty?'Many matching entities':many?'A result to compare':'A @ HA · B @ HB2 · C @ HC'};
      result.note='An active Fetch or subscription holds a lease that pins its tree. Dropping the last lease makes the tree eligible for LRU eviction. A small query can select its inventory from the tree’s ordered membership without building digest nodes for the larger tree.';
      break;
    case 'offer':
      result.paragraphs = many
        ? ['The requester uses or lazily builds a digest tree for its captured result, then chooses a bounded set of non-overlapping span digests covering the full address space.', 'A digest represents the members and their heads in one span. Matching digests let the peers skip that span.']
        : [empty ? 'The requester sends one empty inventory covering the full address space. This explicitly says “I have no matches for this Selection.”' : 'The requester sends one inventory containing A and B, their tree keys, and their full causal clocks.', 'Small inventories can be sent directly, including a narrow view of a larger tree. These heads do not require building digest nodes.'];
      result.visual={kind:'offer',label:many?'Bounded span digests':empty?'Heads: []':'Heads: A @ HA, B @ HB',detail:many?'R1 · R2 · … cover the full address space':'One full-span inventory'};
      result.payload={label:'See the KnownState fields',body:knownState(state.local)};
      result.note='TreeSpec defines the resident tree’s predicate and key layout. KnownState describes this query’s selected members within that layout. The captured comparison stays frozen while the resident tree continues to receive updates.';
      break;
    case 'request':
      result.paragraphs=['The requester sends one Fetch request containing the Selection and its KnownState. The responder uses its own node’s shared LRU too: reuse a compatible entry or capture and add one, then compare a frozen snapshot with the offer.','The responder sends exactly one Fetch response. Its StateReply includes the stream ID, the captured round, and frame 0. Later data can be pushed separately.'];
      result.messages=[request('Fetch',`Fetch {\n  selection: ${selection},\n  known_state: ${knownState(state.local)}\n}`, 'NodeResponseBody::Fetch(StateReply)')];
      result.note='The next steps show what that response contains. All examples use stream S1 and round 0; names and encoded values are abbreviated.';
      break;
    case 'compare':
      result.paragraphs=empty
        ? ['The responder knows the requester’s matching result is empty. It can start sending snapshots immediately; asking for smaller digests would add no useful information.']
        : many ? ['The responder compares the offered digests with its captured result. Equal spans need no data. For a differing span, it chooses between asking for heads and comparing smaller spans.','Choose what this comparison finds. The next steps follow that branch.']
        : ['The responder already has A’s and B’s exact clocks. It leaves unchanged A alone, prepares connecting events for newer B, and a snapshot for new member C.'];
      if(many) result.choices={field:'difference',label:'What differs?',options:differenceOptions};
      result.visual={kind:'decision',label:empty?'Known empty → snapshots':many?(state.difference==='equal'?'Equal digests → no entity data':state.difference==='small'?'Small difference → ask for heads':'Large difference → compare subspans'):'Exact clocks → send only changes',detail:empty?'No inventory question is needed.':many?'The responder chooses within its own byte and work budgets.':'A stays local. B and C need data.'};
      break;
    case 'equal':
      result.paragraphs=['The digests and counts agree for the complete captured result. The responder returns an empty item list with progress: Complete.','It does not echo the digests or send entity heads. The existing local result has been confirmed for this round.'];
      result.messages=[response(`Fetch(StateReply { spec, round: { number: 0, revision: 100 },\n  frame: ${stateBody('[]','Complete')}\n})`,'progress: Complete')];
      break;
    case 'refine':
      result.paragraphs=['The responder splits the differing span R into R1 and R2 and sends its digests for those exact bounds. The requester answers both from its frozen snapshot.','Here R1 agrees, so it needs no further work. R2 differs and has only 32 responder rows; the next question asks for its entity heads. A still-large difference could repeat this refinement.'];
      result.messages=[response(stateBody('[Digest(R1: D1, count: 480), Digest(R2: D2, count: 32)]','Continue'),'progress: Continue'),feedback('[Digest(R1: D1, count: 480), Digest(R2: D2local, count: 32)]'),success()];
      result.note='Digest is a question inside the State frame. Its answer is a new ContinueState request. The Success response carries no next question or data.';
      break;
    case 'heads': {
      const bounds = state.difference==='large'?'R2':'R';
      result.paragraphs=[`The responder asks for the requester’s exact keys, entity IDs and clocks in ${bounds}. That identifies which entities are missing or have different histories.`,`The requester answers from its frozen snapshot. This example fits in one inventory answer; a larger inventory can need bounded pages.`];
      const question = stateBody(`[NeedHeads(${bounds})]`,'Continue',state.difference==='large'?1:0);
      result.messages=state.difference==='large'?[pushed('NeedHeads · frame 1',question,'progress: Continue'),ack()]:[response(question,'progress: Continue')];
      result.messages.push(feedback(`[Heads(TreeSpanInventory { bounds: ${bounds}, heads: packed […] })]`),success());
      result.note='The responder can continue independent work while waiting. ContinueState both answers the question and returns credit for frames already processed.';
      break;
    }
    case 'transfer':
      result.paragraphs=empty
        ? ['The first snapshots arrive inside the Fetch response. More snapshots arrive as numbered StateFrame updates, without a request for each page.','The requester returns processed-through credit in ContinueState so the responder can free its send buffers and keep sending. The final enumeration frame carries progress: Complete.']
        : many ? ['The responder supplies the authoritative membership of the differing span and the entity data needed there. Matching spans need no entity transfer.','When an entity clock is known, connecting events can be used. An unknown entity usually starts with a snapshot. Large payloads are chunked.']
        : ['The Fetch response contains connecting events for B and a snapshot for C. A is unchanged and is not sent again.','This small example fits in frame 0 with progress: Complete. Larger changes can continue in separately pushed frames.'];
      result.messages=empty ? [response(stateBody('[Snapshots(first page)]','Continue'),'progress: Continue'),pushed('Snapshots · frame 1',stateBody('[Snapshots(next page)]','Continue',1),'progress: Continue'),ack(),feedback('[]'),success(),pushed('Snapshots · frame 2',stateBody('[Snapshots(last page)]','Complete',2),'progress: Complete'),ack()]
        : many ? [pushed('Membership + repairs',stateBody('[Heads(responder inventory), Repair { target: HE, delta: … }]','Complete','next'),'progress: Complete'),ack()]
        : [response(stateBody('[Repair { target: HB2, delta: EventBridge(B, …) },\n      Snapshots { bounds: C_range, states: [C@HC] }]','Complete'),'progress: Complete')];
      result.note='An UpdateAck confirms routing, not application and not stream credit. A ContinueState Success can arrive before or after separately pushed data; the illustration chooses one order.';
      break;
    case 'apply':
      result.paragraphs=['The requester applies snapshots and events through normal validation. It checks that its actual entity state incorporates every target offered by this round.','Receiving progress: Complete only ends enumeration. It does not prove that the data has been incorporated.'];
      result.choices={field:'repair',label:'Can an offered snapshot be incorporated?',options:[{value:false,label:'Yes',detail:'The target is covered'},{value:true,label:'Needs connecting history',detail:'A concurrent local edit prevents simple adoption'}]};
      result.visual={kind:'decision',label:state.repair?'Missing history → ask for repair':'Targets covered → install the result',detail:'Application is local work; it sends no message by itself.'};
      break;
    case 'repair':
      result.paragraphs=[`The requester still needs connecting history for ${target} at its offered target. It sends NeedRepair inside ContinueState.`,`The responder pushes the connecting events. The requester applies them and verifies coverage; it may keep newer or concurrent local changes too.`];
      result.messages=[feedback(`[NeedRepair { entity_id: ${target}, target: Htarget }]`),success(),pushed('Connecting events',stateBody(`[Repair { target: Htarget, delta: EventBridge(${target}, …) }]`,'Continue','next'),'progress: Continue'),ack()];
      result.note='A late repair frame can say Continue after an earlier Complete. That does not reopen enumeration. Unavailable required history fails the stream explicitly.';
      break;
    case 'ready':
      result.paragraphs=['The round has ended enumeration, its required targets are covered, and the confirmed result membership is installed. The Fetch can now return.','The result uses the requester’s incorporated entity state. It need not have exactly the same final hashes as the captured peer state if concurrent edits were retained.'];
      result.visual={kind:'ready',label:'Fetch result is ready',detail:'No reply to a cleanup request is needed for readiness.'};
      break;
    case 'finish':
      result.paragraphs=['The requester sends FinishStateRound with outcome: Applied. The responder releases that round’s captured state and retires the one-shot Fetch stream.','The comparison snapshot can be released. The resident cache entry remains available for a later Fetch and continues to consume changes until it is evicted.'];
      result.messages=[request('FinishStateRound','FinishStateRound {\n  stream: S1, round: 0,\n  outcome: Applied { processed_through: last_processed_sequence }\n}'),success()];
      result.note='An unfinished Fetch can instead abandon its stream. AbandonStateStream is a one-way NodeMessage with no response.';
      result.end={href:'livequery.html',label:'Next: what changes for a live query?'};
      break;
    case 'subscribe':
      result.context='A live query uses the same comparison machinery';
      result.paragraphs=['SubscribeQuery starts with the same Selection and KnownState as Fetch. Here the requester has many matches and offers span digests. QuerySubscribed contains the initial StateReply and frame 0.','The subscription holds a lease on the maintained tree, including across reconnects, and tracks its own query membership. Compatible subscriptions share the tree, but can have different ranges, ordering and limits. QuerySubscribed alone does not mean the result is loaded.'];
      result.messages=[request('SubscribeQuery',`SubscribeQuery { query_id: Q, version: 1,\n  selection: ${selection},\n  known_state: ${knownState('many')} }`,'NodeResponseBody::QuerySubscribed { query_id, state: StateReply }'),wire('left','QuerySubscribed · frame 0','NodeResponseBody::QuerySubscribed','None.','QuerySubscribed { query_id: Q, state: StateReply {\n  spec, round: { number: 0, revision: 100 },\n  frame: StateFrame { stream: S1, sequence: 0,\n    body: State { round: 0, items: [NeedHeads(R)], progress: Continue } }\n} }','progress: Continue')];
      break;
    case 'overlap':
      result.paragraphs=['Round 0 compares the captured result at revision 100. While its head question is outstanding, live revision 101 can arrive. Live delivery is not held until the comparison finishes.','In this example, revision 101 removes A and adds B. Answers to round 0 still come from the original frozen requester snapshot.'];
      result.messages=[pushed('Live revision 101', 'StateFrame { stream: S1, sequence: 1,\n  body: Live { revision: 101,\n    items: [A absent + causal data, B present + causal data],\n    complete: true\n  }\n}','complete: true'),ack()];
      result.note='Source revisions, frame sequences, and entity causal clocks are different things. This Live publication is one logical change, even if it takes several frames.';
      break;
    case 'publish':
      result.paragraphs=['After all fragments and required entity data for revision 101 are applied, the requester publishes its membership changes and causing events together.','A later-arriving baseline page from revision 100 cannot undo that committed removal of A or addition of B.'];
      result.visual={kind:'ready',label:'A absent · B present',detail:'Committed live membership survives the older baseline.'};
      result.messages=[request('ContinueState','ContinueState { stream: S1, round: None,\n  processed_through: 1, applied_through: Some(101), answers: []\n}'),success()];
      result.note='processed_through releases retained frames. applied_through confirms committed live-publication coverage and releases its retained repair targets.';
      break;
    case 'complete-live':
      result.paragraphs=['The requester still owes an answer to the NeedHeads(R) question from frame 0. It sends the heads from its original frozen snapshot, even though live revision 101 has now been applied.', 'The responder compares those heads and pushes the remaining membership and repairs for round 0. This final enumeration frame says progress: Complete. The requester applies it without undoing the newer live changes.'];
      result.messages=[feedback('[Heads(TreeSpanInventory { bounds: R, heads: packed […] })]'),success(),pushed('Remaining round data · frame 2',stateBody('[Heads(responder inventory), Repair { target: Htarget, delta: … }]','Complete',2),'progress: Complete'),ack()];
      result.note='This example needs no further history. The next step waits for actual target coverage and installation, not just receipt of Complete.';
      break;
    case 'ready-live':
      result.paragraphs=['The livequery becomes loaded when this finite round is covered and installed, preserving newer committed changes. It does not wait indefinitely for future writes.','FinishStateRound releases only the captured round. Live delivery continues on the same stream; it was already allowed before this request.'];
      result.messages=[request('FinishStateRound','FinishStateRound { stream: S1, round: 0,\n  outcome: Applied { processed_through: last_processed_sequence }\n}'),success()];
      result.visual={kind:'ready',label:'Loaded · stream still open',detail:'One captured comparison can finish while synchronization continues.'};
      break;
    case 'refresh':
      result.paragraphs=['An explicit refresh captures fresh requester knowledge and asks for another comparison on the existing stream. The responder marks the new round with BeginRound.','The comparison again uses captured versions. Later live publications can overlap it. The current implementation does not schedule automatic periodic refreshes.'];
      result.messages=[request('RefreshState','RefreshState { stream: S1, round: 1, known_state: … }'),success(),pushed('BeginRound','StateFrame { stream: S1, sequence: next,\n  body: BeginRound(StateRound { number: 1, revision: 101 })\n}'),ack()];
      result.note='Refresh waits for the previous round to be released. Cancelling a round with FinishStateRound { outcome: Cancelled } makes no coverage claim and still preserves the stream.';
      break;
    case 'close':
      result.paragraphs=['When the stream is no longer wanted, the requester sends AbandonStateStream. It ends that stream’s active round and live delivery.','This is a one-way message. It allocates no request waiter and expects neither a NodeResponse nor an UpdateAck.'];
      result.messages=[wire('right','AbandonStateStream','NodeMessage::AbandonStateStream','None.','AbandonStateStream { from: requester, to: responder, stream: S1 }')];
      result.note='Delayed traffic or cleanup for S1 cannot replace or tear down a newer stream. Unsubscribe, query replacement, failure and disconnect also end the appropriate subscription lifetime.';
      result.end={href:'reference.html',label:'Open the protocol reference'};
      break;
    default: throw new Error(`Unknown step: ${state.step}`);
  }
  return result;
}
