// The lessons' content and the route a reader's choices take through their
// steps, kept apart from the browser presentation in app.mjs.
export const selection = "project = 'acme'";
const spec = "TreeSpec { key_spec: [project: String], predicate: project = 'acme' }";

// Wire bodies are schematic: names and encoded values are abbreviated.
const nest = text => text.replaceAll('\n', '\n  ');
const keyed = (id, clock) => `{ key: Kacme, entity: EntityHead { entity_id: ${id}, head: ${clock} } }`;
const entityHead = (id, clock) => `EntityHead { entity_id: ${id}, head: ${clock} }`;
// An account that lists every head of a result in one inventory over the whole tree.
const listed = heads => `KnownState {\n  spec: ${spec},\n  spans: [Heads(TreeSpanInventory {\n    bounds: TreeSpan::all(),\n    heads: packed [${heads.length ? '\n      '+heads.join(',\n      ')+'\n    ' : ''}]\n  })]\n}`;
// An account of a result too large to list: a frontier of span digests.
const frontier = spans => `KnownState {\n  spec: ${spec},\n  spans: [\n    ${spans.join(',\n    ')}\n  ]\n}`;
const spanDigest = (prefix, bounds, digest) => `Digest(TreeSpanDigest { prefix: ${prefix}, bounds: ${bounds}, digest: ${digest} })`;
const headsPage = (bounds, heads) => `Heads(TreeSpanInventory {\n  bounds: ${bounds},\n  heads: packed [\n    ${heads.join(',\n    ')}\n  ]\n})`;

const wire = (direction, label, type, reply, body, summary = '') => ({ direction, label, type, reply, body, summary });
const request = (name, body, reply) => wire('right', name, `NodeMessage::Request → NodeRequestBody::${name}`, `NodeResponseBody::${reply}`, body);
const response = (label, variant, answers, body, summary) => wire('left', label, `NodeMessage::Response → NodeResponseBody::${variant}`, `None. It answers the ${answers}.`, body, summary);
const fetchRequest = offer => request('Fetch', `Fetch {\n  selection: ${selection},\n  known_state: ${nest(offer)}\n}`, 'Fetch(KnownState)');
const fetchResponse = (target, summary) => response('Fetch response', 'Fetch(KnownState)', 'Fetch', `Fetch(${target})`, summary);
const subscribeQuery = offer => request('SubscribeQuery', `SubscribeQuery {\n  query_id: Q,\n  selection: ${selection},\n  version: 1,\n  known_state: ${nest(offer)}\n}`, 'QuerySubscribed { query_id, target }');
const querySubscribed = (target, summary) => response('QuerySubscribed', 'QuerySubscribed', 'SubscribeQuery', `QuerySubscribed {\n  query_id: Q,\n  target: ${nest(target)}\n}`, summary);
const compareSpans = questions => request('CompareSpans', `CompareSpans {\n  selection: ${selection},\n  spec: ${spec},\n  questions: [${questions.join(', ')}]\n}`, 'SpansCompared { answers }');
const spansCompared = (answers, summary) => response('SpansCompared', 'SpansCompared', 'CompareSpans', `SpansCompared {\n  answers: [\n    ${answers.map(nest).map(nest).join(',\n    ')}\n  ]\n}`, summary);
const syncEntities = entities => request('SyncEntities', `SyncEntities {\n  selection: ${selection},\n  entities: [\n    ${entities.join(',\n    ')}\n  ]\n}`, 'EntitiesSynced { held, unavailable }');
const entitiesSynced = (held, summary) => response('EntitiesSynced', 'EntitiesSynced', 'SyncEntities', `EntitiesSynced {\n  held: [\n    ${held.join(',\n    ')}\n  ],\n  unavailable: []\n}`, summary);
// The receiver acknowledges every update, but no sender reads the acknowledgment.
const update = (label, items, summary) => wire('left', label, 'NodeMessage::Update → NodeUpdateBody::SubscriptionUpdate', 'NodeMessage::UpdateAck, which the sender does not read.', `NodeUpdate {\n  id: U, from: responder, to: requester,\n  body: SubscriptionUpdate { items: [\n    ${items.map(nest).map(nest).join(',\n    ')}\n  ] }\n}`, summary);
const item = (id, content, relevance = '[]') => `SubscriptionUpdateItem {\n  entity_id: ${id},\n  content: ${content},\n  predicate_relevance: ${relevance}\n}`;
const stateOf = (id, clock) => `StateAndEvent(state of ${id} at ${clock}, [])`;
const eventsAfter = (id, clock) => `EventOnly([events of ${id} after ${clock}])`;
const change = (id, clock) => `StateAndEvent(state of ${id} at ${clock}, [the event that made ${clock}])`;

export function knownState(local) {
  if (local === 'many') return frontier([spanDigest('P1', 'F1', 'D1'), spanDigest('P2', 'F2', 'D2'), '…']);
  return listed(local === 'few' ? [keyed('A','HA'), keyed('B','HB'), keyed('D','HD')] : []);
}
// The responder's account of its result, the requester's target.
function target(local) {
  if (local === 'many') return frontier([spanDigest('PT1', 'T1', 'DT1'), '…', spanDigest('PR', 'R', 'DR'), '…']);
  return listed(local === 'few' ? [keyed('A','HA'), keyed('B','HB2'), keyed('C','HC')] : [keyed('E1','H1'), keyed('E2','H2'), '… 300 heads in all']);
}
// What the responder pushes to bring the requester's copy to the target, and
// what a repair names again when an update carrying it is lost.
const pushes = {
  none: () => [
    update('Update · items 1–128', [item('E1', stateOf('E1','H1')), '…'], '128 items'),
    update('Update · items 129–256', [item('E129', stateOf('E129','H129')), '…'], '128 items'),
    update('Update · items 257–300', [item('E257', stateOf('E257','H257')), '…'], '44 items'),
  ],
  few: () => [update('Update', [item('B', eventsAfter('B','HB')), item('C', stateOf('C','HC')), item('D', eventsAfter('D','HD'))], '3 items')],
  many: () => [update('Update', [item('J', eventsAfter('J','HJ')), item('K', stateOf('K','HK')), item('L', eventsAfter('L','HL'))], '3 items')],
};
const repairs = {
  none: () => [syncEntities([entityHead('E129','[]'), '… 128 entities in all']), entitiesSynced([entityHead('E129','H129'), '…'], '128 held heads'), update('Update · items 129–256', [item('E129', stateOf('E129','H129')), '…'], '128 items')],
  few: () => [syncEntities([entityHead('B','HB'), entityHead('C','[]'), entityHead('D','HD')]), entitiesSynced([entityHead('B','HB2'), entityHead('C','HC'), entityHead('D','HD2')]), ...pushes.few()],
  many: () => [syncEntities([entityHead('J','HJ'), entityHead('K','[]'), entityHead('L','HL')]), entitiesSynced([entityHead('J','HJ2'), entityHead('K','HK'), entityHead('L','HL2')]), ...pushes.many()],
};

export function defaults(lesson = 'fetch') { return {lesson, local:'none', cache:'miss', difference:'large', lost:false, step:lesson === 'live' ? 'subscribe' : 'lookup'}; }
export function route(state) {
  if (state.lesson === 'live') return ['subscribe','initial','established','live','check','recheck','unsubscribe'];
  const steps = ['lookup','local','offer','request','compare'];
  if (state.local === 'many') {
    steps.push('target');
    if (state.difference === 'equal') return [...steps,'ready'];
    if (state.difference === 'large') steps.push('refine');
    steps.push('heads','sync');
  }
  steps.push('push','apply');
  if (state.lost) steps.push('repair');
  return [...steps,'ready'];
}
export function parseState(hash, lesson = 'fetch') {
  const values = new URLSearchParams(hash.replace(/^#/,''));
  const state = defaults(lesson);
  if (['hit','miss'].includes(values.get('cache'))) state.cache = values.get('cache');
  if (['none','few','many'].includes(values.get('local'))) state.local = values.get('local');
  if (['equal','small','large'].includes(values.get('difference'))) state.difference = values.get('difference');
  state.lost = values.get('lost') === 'yes';
  const steps = route(state);
  if (steps.includes(values.get('step'))) state.step = values.get('step');
  return state;
}
export function hashFor(state) {
  const values = new URLSearchParams({step:state.step});
  if (state.lesson !== 'live') { values.set('cache',state.cache); values.set('local',state.local); values.set('difference',state.difference); if (state.lost) values.set('lost','yes'); }
  return '#'+values;
}
export const titles = {
  lookup:'Look for a cached tree', local:'Snapshot the local copy', offer:'Prepare the offer', request:'Send Fetch', compare:'Compare and answer',
  target:'Compare the target with the copy', refine:'Compare smaller spans', heads:'Ask for a page of heads', sync:'Name what the copy lacks',
  push:'Receive the pushes', apply:'Apply the pushes', repair:'Repair what did not arrive', ready:'Return the result',
  subscribe:'Subscribe, installing the query first', initial:'Receive the initial pushes', established:'Become established when ready',
  live:'Apply live updates', check:'Check the copy periodically', recheck:'Repair after two disagreements', unsubscribe:'Unsubscribe'
};
const localOptions = [{value:'none',label:'None',detail:'0 matching entities'}, {value:'few',label:'A few',detail:'A, B and D'}, {value:'many',label:'Many',detail:'4,096 matching entities'}];
const differenceOptions = [{value:'equal',label:'Everything agrees',detail:'Every digest matches'}, {value:'small',label:'One small span differs',detail:'32 responder heads in R'}, {value:'large',label:'One large span differs',detail:'512 responder heads in R'}];
const lostOptions = {none:'Items 129–256 never arrive', few:'B, C and D never arrive', many:'J, K and L never arrive'};

export function page(state) {
  const many = state.local === 'many', empty = state.local === 'none';
  // The text for the reader's starting copy.
  const per = choices => choices[state.local];
  const context = state.lesson === 'live' ? 'A live query · the same comparison, then live updates' : empty ? 'No local matches' : many ? `Many local matches · ${{equal:'all agree',small:'a small difference',large:'a large difference'}[state.difference]}` : 'Three local matches';
  const result = { title:titles[state.step], context, paragraphs:[], messages:[], note:'', choices:null, visual:null };
  switch(state.step) {
    case 'lookup':
      result.paragraphs = ['A Fetch reads a query’s result from a peer once. Before it asks, the node needs an account of what it already holds of that result. It reads that account from a resident tree: an in-memory tree of each matching entity’s key, entity ID and Clock, which reactor maintenance updates on every commit. One LRU of resident trees serves every Fetch, live query and comparison on the node.', 'Choose whether this Fetch finds a tree it can use. A cached tree serves it when the tree holds every member the Selection can match, its keys can address the Selection’s range and, under a LIMIT, its ordering, and its readers’ effective access equals this reader’s. Otherwise the node builds a tree, which reactor maintenance keeps current in the same way.'];
      result.choices={field:'cache',label:'Is there a compatible tree in the cache?',options:[{value:'miss',label:'No cached tree',detail:'Build and add one'},{value:'hit',label:'Tree already cached',detail:'Use the maintained tree'}]};
      result.visual={kind:'decision',label:state.cache==='hit'?'Cache hit → reuse the tree':'Cache miss → build a tree',detail:'Find a tree whose TreeSpec can serve this Fetch’s Selection.'};
      result.note='For example, a tree covering all of project = acme AND foo > 7 can serve foo > 10 when keyed by project and foo. It cannot serve foo > 3. A tree built for a limited result serves only that same Selection.';
      break;
    case 'local':
      result.title=state.cache==='hit'?'Snapshot the cached tree':'Build a tree from local matches and snapshot it';
      result.paragraphs = [state.cache==='hit'?'The node folds every commit published so far into the cached tree, checks the reader’s current access, and takes a frozen snapshot of the tree’s keys, entity IDs and Clocks for this Fetch. The resident tree keeps updating; the snapshot does not.':'The node subscribes the new tree to reactor maintenance before it reads local matches from storage, so a commit that crosses the read is folded in rather than missed. It builds the tree from the matches’ keys, entity IDs and Clocks, adds it to the LRU, and takes a frozen snapshot. Entity payloads read during the build are discarded. Without a LIMIT the tree covers the whole predicate; a new limited query keeps only its own result, and the cache records that narrower coverage.', 'Choose the requester’s starting copy. The predicate stays the same in every case.'];
      result.choices={field:'local',label:'How many matches does the requester already have?',options:localOptions};
      result.visual={kind:'members',left:per({none:'No matching entities',few:'A @ HA · B @ HB · D @ HD',many:'4,096 matching entities'}),right:per({none:'300 matching entities',few:'A @ HA · B @ HB2 · C @ HC · D has left the result',many:'A result of about the same size'})};
      result.note='A snapshot pins its tree while the snapshot lives. A tree no snapshot pins stays in the LRU, still maintained, until the allowance for idle trees, 32 trees and 128 MiB, evicts it. A tree builds its digests the first time something reads one and maintains them on every commit after that; a tree read only as head inventories never builds them.';
      break;
    case 'offer':
      result.paragraphs = many
        ? ['The requester describes its snapshot as a frontier of span digests: at most 128 disjoint spans that together cover every address, each with a digest of the heads within it and their count. If nothing has read the tree’s digests before, this read builds them; every commit after that maintains them.', 'A digest stands for every member and head in its span. Two copies whose digests agree over the same bounds agree on that span.']
        : [empty ? 'The requester sends one inventory over the whole address space with no heads in it. An empty inventory says “I hold no matches of this Selection,” which is more than saying nothing.' : 'The requester sends one inventory over the whole address space, listing A, B and D with their tree keys and full Clocks.', 'An offer lists every head when they fit its limits, 2,048 heads and 256 KiB of work; only a larger copy is described by digests. A list of heads lets the responder see exactly which entities differ, and reads no digests on either node.'];
      result.visual={kind:'offer',label:per({none:'Heads: []',few:'Heads: A @ HA, B @ HB, D @ HD',many:'Span digests'}),detail:many?'F1 · F2 · … cover every address':'One inventory over the whole tree'};
      result.payload={label:'See the KnownState fields',body:knownState(state.local)};
      result.note='TreeSpec names the tree: its key layout and predicate. KnownState is a node’s account of its query result under a TreeSpec. A range no span covers is unknown, not empty. Neither the tree nor the offer holds entity payloads.';
      break;
    case 'request':
      result.paragraphs=['The requester registers the Fetch with its connection to the peer, then sends one Fetch request carrying the Selection and its KnownState. The registration comes first because the peer may push data before it answers: while a Fetch is in flight, the applier admits that peer’s pushes under the Fetch’s credentials.','The response will carry the responder’s account of its result, not entity data. The data arrives on the update channel between the two peers, which also carries a subscription’s live changes.'];
      result.messages=[fetchRequest(knownState(state.local))];
      result.note='Every example abbreviates names and encoded values.';
      break;
    case 'compare':
      result.paragraphs=['The responder takes a snapshot of its own resident tree for the Selection, under the requester’s TreeSpec, and compares it with the offer. '+per({
          none:'The offer’s empty inventory says the requester holds nothing, so all 300 of the responder’s members are lacking.',
          few:'The offer lists A at the head the responder holds, B at an older head, and D, which has left the responder’s result; it does not list C. So B, C and D are lacking: B because the copy holds an older head, C because it holds none, and D so that the requester learns D’s current state.',
          many:'A nonempty digest names no entities, so nothing is lacking: the responder pushes nothing for spans the offer describes by digest, and leaves comparing them to the requester.'}),
        'It answers with its own account of the same snapshot, the target: '+(many?'a frontier of span digests, since its result is too large to list. ':'every head, since its result fits an offer’s limits. A task of its own pushes each lacking entity on the update channel. ')+'The responder drops its snapshot and keeps nothing for this Fetch afterwards.'];
      result.messages=[fetchResponse(target(state.local),per({none:'target: 300 heads',few:'target: 3 heads',many:'target: span digests'}))];
      result.note=many?'The target’s spans need not line up with the offer’s: the requester computes its own digest over each target span’s bounds.':'The push task starts before the response goes out, so pushes can arrive before, between or after it.';
      break;
    case 'target':
      result.paragraphs=['The requester takes a fresh snapshot of its tree under the target’s TreeSpec and computes its own digest over each target span’s bounds. A span whose digests agree is matched and needs nothing more.','A span whose digests differ is repaired at once, without waiting, because the responder pushed nothing for spans the offer described by digest. Choose what this comparison finds. The next steps follow that branch.'];
      result.choices={field:'difference',label:'What differs?',options:differenceOptions};
      result.visual={kind:'decision',label:{equal:'Every digest agrees → ready',small:'R differs, counting 32 heads → ask for them',large:'R differs, counting 512 heads → compare its parts'}[state.difference],detail:{equal:'The copy matches the target without any entity data.',small:'One page holds up to 128 heads.',large:'R holds more heads than one page, so the requester splits it first.'}[state.difference]};
      break;
    case 'refine':
      result.paragraphs=['The responder’s digest of R counts 512 heads, more than one page of 128. The requester splits R the way its own tree divides it, here into R1 and R2, and asks in one CompareSpans for the responder’s digests of exactly those bounds.','The responder answers from a fresh snapshot of its tree, which it drops afterwards. R1 agrees and is matched. R2 differs and counts 32 heads, so the next question asks for R2’s heads.'];
      result.messages=[compareSpans(['Digest(R1)','Digest(R2)']),spansCompared([spanDigest('root','R1','DR1 · count 480'),spanDigest('root','R2','DR2 · count 32')])];
      result.note='One CompareSpans carries at most 128 questions, of which at most 4 ask for heads. A span that still differs and counts more than a page is split again the same way.';
      break;
    case 'heads': {
      const bounds = state.difference==='large'?'R2':'R';
      result.paragraphs=[`The requester asks for the responder’s heads in ${bounds}. A page holds at most 128 heads and 64 KiB of work; one that stops short ends at its last head, and the requester asks for the rest.`,'It checks each head against its copy: covered when the copy holds that head or a causally newer one. Here J is held at an older head and K is missing, and the copy holds L within the span, which the page does not list.'];
      result.messages=[compareSpans([`Heads(${bounds})`]),spansCompared([headsPage(bounds,[keyed('J','HJ2'),keyed('K','HK'),'… 32 heads in all'])],'a page of 32 heads')];
      break;
    }
    case 'sync':
      result.paragraphs=['The requester names, in one SyncEntities, each responder head its copy does not cover and each local member the page does not list, with the head the copy holds of each: J at its older head, K with an empty head because the copy holds none, and L at its head.','The responder pushes each named entity it may send, unless it holds the entity at exactly the head named, and answers with the head it holds of each entity it may send and the entities it holds no readable state of. The held heads let the requester settle members, like L, that the responder’s result does not list.'];
      result.messages=[syncEntities([entityHead('J','HJ'),entityHead('K','[]'),entityHead('L','HL')]),entitiesSynced([entityHead('J','HJ2'),entityHead('K','HK'),entityHead('L','HL2')])];
      result.note='One SyncEntities names at most 128 entities. It carries the Selection because the Selection decides whether the request is a catalog read, which needs no credentials.';
      break;
    case 'push':
      result.paragraphs=[per({
          none:'The responder’s push task reads states a page at a time and sends each lacking entity as one SubscriptionUpdateItem, gathering up to 128 items and about 1 MiB of item data into each update. The 300 entities take three updates, each item carrying the entity’s current state.',
          few:'One update carries all three items. B arrives as its events after the head the requester listed, C as its whole state, and D as its events after HD: for each entity the responder sends the smaller of its connecting events and its state.',
          many:'One update carries the three named entities: J as its events after HJ, K as its whole state, and L as its events after HL. For each entity the responder sends the smaller of its connecting events and its state.'}),
        'These items carry no query tag, because a Fetch’s pushes belong to no standing query of the requester’s. Updates can arrive in any order, and one can be lost.'];
      result.messages=pushes[state.local]();
      result.note='The receiver answers each update with an UpdateAck that the sender does not read, so nothing waits on one.';
      break;
    case 'apply':
      result.paragraphs=['The requester applies each pushed state and event through the same validation as any update. Its own reactor then decides what each change means for its queries, and reactor maintenance updates its resident tree as each change commits. '+per({
          none:'All 300 entities join the local result.',
          few:'B and C match at their new heads; D’s new state no longer matches the predicate, so D leaves the local result.',
          many:'J and K match at the responder’s heads; L’s new state no longer matches the predicate, so L leaves the local result.'}),
        'After each change the requester checks its copy against the target again. Choose whether every update arrives.'];
      result.choices={field:'lost',label:'Does every update arrive?',options:[{value:false,label:'Every update arrives',detail:'The copy reaches the target'},{value:true,label:'One update is lost',detail:lostOptions[state.local]}]};
      result.visual={kind:'decision',label:state.lost?'An update is lost → the copy stops progressing':'Every head covered → ready',detail:state.lost?'The requester cannot see the loss; it sees its copy stop changing.':'Applying sends no message by itself.'};
      break;
    case 'repair':
      result.paragraphs=['The requester cannot see a lost update; it sees its copy stop progressing. When the copy has gone the idle interval without progress, the longer of 1 s and four times the last measured round trip, and is still not ready, the requester repairs what remains outstanding.',per({
          none:'The target lists every responder head, so nothing needs descending: one SyncEntities names the 128 uncovered entities, each with an empty head, and the responder pushes their states again.',
          few:'The target lists every responder head, so nothing needs descending: one SyncEntities names B at HB and C with an empty head, which the target lists, and D at HD, which is still in the local result although the target does not list it. The responder pushes all three again.',
          many:`The page the descent fetched already lists the responder’s heads in ${state.difference==='large'?'R2':'R'}, so nothing needs descending again: one SyncEntities names J, K and L again, and the responder pushes them again.`})];
      result.messages=repairs[state.local]();
      result.note='Each repair that brings no progress doubles the interval. After three, a Fetch fails with a typed error that names the peer. Where a span is still described only by digest, the repair first descends to pages of heads.';
      break;
    case 'ready':
      result.paragraphs=[many&&state.difference==='equal'?'Every target span’s digest equals the copy’s digest over the same bounds, so the copy matches the target without any entity data, one round trip after the Fetch went out. The Fetch returns.':per({
          none:'The copy covers all 300 heads in the target, and no local member lies outside it. The Fetch returns.',
          few:'The copy covers A at HA, B at HB2 and C at HC, and D has left the local result, so no local member outside the target remains unsettled. The Fetch returns.',
          many:'Every span is now matched or listed, every listed head is covered, and L has left the local result. The Fetch returns.'}),
        'The result is the requester’s own copy, which can be ahead of the target: a local write the responder has not seen still covers the older head. The Fetch’s registration with the peer drops, so the applier refuses that peer’s later pushes unless a subscription admits them. The resident tree stays in the LRU for later queries.'];
      result.visual={kind:'ready',label:'The Fetch result is ready',detail:'Readiness is judged from the requester’s own copy, never from what the responder says it sent.'};
      result.end={href:'livequery.html',label:'Next: what changes for a live query?'};
      break;
    case 'subscribe':
      result.paragraphs=['A live query keeps a query’s result current. The node’s subscription relay sends one SubscribeQuery to a durable peer, with a query ID, a version, the Selection and a KnownState of the local copy, made as for a Fetch. Here the requester holds A and B, so it lists both heads, and the relay marks the query Requested.','The responder installs the query in its reactor subscription for this peer before it takes the snapshot it compares. A commit after the install reaches the requester as a live update, a commit before the snapshot is in the comparison, and a commit between does both, which applying twice tolerates. The responder then compares, starts pushing what the requester lacks, and answers with its target.'];
      result.messages=[subscribeQuery(listed([keyed('A','HA'),keyed('B','HB')])),querySubscribed(listed([keyed('A','HA'),keyed('B','HB2'),keyed('C','HC')]),'target: 3 heads')];
      result.note='QuerySubscribed says the query is installed and names the target. The result has not loaded until the copy reaches the target.';
      break;
    case 'initial':
      result.paragraphs=['The responder pushes B and C on the update channel, as it pushes a Fetch’s data, but tags each item (Q, Initial), the tag for a subscription’s initial data.','Meanwhile a write to A commits on the responder after the install. The responder’s reactor subscription pushes it as a live update carrying A’s new state and the event that made it, with no tag, because A still matches. It may arrive before or after the initial pushes; the requester applies whatever arrives.'];
      result.messages=[update('Initial update',[item('B',eventsAfter('B','HB'),'[(Q, Initial)]'),item('C',stateOf('C','HC'),'[(Q, Initial)]')],'2 items · (Q, Initial)'),update('Live update',[item('A',change('A','HA2'))],'1 item')];
      result.note='The tags record how membership changed on the responder. The requester’s applier does not read them: its own reactor decides membership.';
      break;
    case 'established':
      result.paragraphs=['The copy now covers every head in the target: A at HA2, which descends from the target’s HA, B at HB2 and C at HC. The query is ready.','The relay tells the live query it is established: the query activates and wait_initialized() returns. The relay marks the query Established and schedules its first periodic check for 30 s later.'];
      result.visual={kind:'ready',label:'Established · result loaded',detail:'Readiness, not the QuerySubscribed response, establishes the query.'};
      result.note='If the copy stops progressing first, the requester repairs it as a Fetch does. After three repairs without progress, the relay keeps the local data, marks the query pending again, and subscribes again on its five-second retry timer.';
      break;
    case 'live':
      result.paragraphs=['From now on the responder’s reactor subscription for this peer pushes every committed change to an entity the query watches. Here one transaction makes D match, makes C stop matching, and changes B, which still matches.','The requester applies the update, and its own reactor decides what each change means: D joins the local result, C leaves it, and B’s new head replaces the old one. Reactor maintenance updates the requester’s resident tree as each change commits, so the copy the next check reads is current.'];
      result.messages=[update('Live update',[item('D',change('D','HD'),'[(Q, Add)]'),item('C',change('C','HC2'),'[(Q, Remove)]'),item('B',change('B','HB3'))],'3 items')];
      result.note='Nothing waits on a live update: the receiver acknowledges it, but no sender reads the acknowledgment. A lost live update goes unnoticed until the entity changes again, the peers reconnect, or a periodic check finds it.';
      break;
    case 'check':
      result.paragraphs=['Thirty seconds after establishment, the relay checks the copy with one CompareSpans holding one question about the whole tree: its heads, when the copy fits one page of 128 as it does here, so that a small live query never builds a digest tree; otherwise its digest.','The answer lists A at HA2, B at HB3 and D at HD. The copy covers each head and holds no member the answer leaves out, so the check agrees. While checks agree, each waits twice as long as the one before, up to 5 minutes: 60 s, 120 s, 240 s, then every 5 minutes.'];
      result.messages=[compareSpans(['Heads(TreeSpan::all())']),spansCompared([headsPage('TreeSpan::all()',[keyed('A','HA2'),keyed('B','HB3'),keyed('D','HD')])],'a page of 3 heads')];
      result.note='The relay starts due checks on its five-second timer. A check that gets no answer within the idle interval counts as a disagreement.';
      break;
    case 'recheck':
      result.paragraphs=['A live update carrying B’s next change, to HB4, is lost. The next check’s answer lists B at HB4, which the copy does not cover, so the check disagrees. One disagreement can be an update still in flight, so the relay checks again 30 s later instead of repairing.','The second check disagrees too, so the requester repairs at once: it names B in SyncEntities with the head it holds, HB3, and the responder pushes B’s events after HB3. The copy now covers B at HB4, and the next check comes 30 s later, with the waits doubling again while checks agree.'];
      result.messages=[compareSpans(['Heads(TreeSpan::all())']),spansCompared([headsPage('TreeSpan::all()',[keyed('A','HA2'),keyed('B','HB4'),keyed('D','HD')])],'the second check · B at HB4'),syncEntities([entityHead('B','HB3')]),entitiesSynced([entityHead('B','HB4')]),update('Update',[item('B',eventsAfter('B','HB3'))],'1 item')];
      result.note='Where a check asks for a digest, the repair first descends to pages of heads, as a Fetch’s repair does.';
      break;
    case 'unsubscribe':
      result.paragraphs=['When the application drops the live query, the relay forgets it and sends UnsubscribeQuery, a one-way message that gets no response.','The responder removes the query, and the credentials it kept for it, from its subscription for this peer, so this query’s changes stop reaching the requester.'];
      result.messages=[wire('right','UnsubscribeQuery','NodeMessage::UnsubscribeQuery','None.','UnsubscribeQuery { from: requester, query_id: Q }')];
      result.note='Replacing the query’s Selection instead sends a new SubscribeQuery for the same query ID at a higher version, which compares again from the start and establishes the query again when it is ready.';
      result.end={href:'reference.html',label:'Open the protocol reference'};
      break;
    default: throw new Error(`Unknown step: ${state.step}`);
  }
  return result;
}
