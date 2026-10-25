import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaults, route, parseState, hashFor, page, knownState} from '../src/learn/synchronization/stories.mjs';

// Every message the lessons show, by its type as the protocol names it.
const protocolTypes = new Set([
  'NodeMessage::Request → NodeRequestBody::Fetch',
  'NodeMessage::Request → NodeRequestBody::SubscribeQuery',
  'NodeMessage::Request → NodeRequestBody::CompareSpans',
  'NodeMessage::Request → NodeRequestBody::SyncEntities',
  'NodeMessage::Response → NodeResponseBody::Fetch(KnownState)',
  'NodeMessage::Response → NodeResponseBody::QuerySubscribed',
  'NodeMessage::Response → NodeResponseBody::SpansCompared',
  'NodeMessage::Response → NodeResponseBody::EntitiesSynced',
  'NodeMessage::Update → NodeUpdateBody::SubscriptionUpdate',
  'NodeMessage::UnsubscribeQuery',
]);

function fetchPaths() {
  const paths = [];
  for (const cache of ['hit', 'miss'])
    for (const local of ['none', 'few', 'many'])
      for (const difference of ['equal', 'small', 'large'])
        for (const lost of [false, true]) paths.push({...defaults(), cache, local, difference, lost});
  return paths;
}

test('every Fetch path can be bookmarked and renders a complete lesson of protocol messages', () => {
  for (const state of fetchPaths()) {
    const steps = route(state);
    assert.equal(new Set(steps).size, steps.length);
    assert.equal(steps.at(-1), 'ready');
    for (const step of steps) {
      const selected = {...state, step};
      assert.deepEqual(parseState(hashFor(selected)), selected);
      const content = page(selected);
      assert.ok(content.title && content.paragraphs.length > 0);
      assert.ok(content.visual || content.messages.length || content.choices);
      for (const message of content.messages) {
        assert.ok(protocolTypes.has(message.type), `${step}: ${message.type}`);
        assert.ok(message.reply && message.body);
        assert.ok(['left', 'right'].includes(message.direction));
      }
    }
  }
});

test('the local copy and what differs decide which questions the requester asks', () => {
  const empty = route(defaults());
  assert.ok(empty.includes('push'));
  assert.ok(!['target', 'refine', 'heads', 'sync'].some(step => empty.includes(step)));
  const equal = route({...defaults(), local:'many', difference:'equal', lost:true});
  assert.deepEqual(equal.slice(-2), ['target', 'ready'], 'agreeing digests need no data and leave nothing to lose');
  const small = route({...defaults(), local:'many', difference:'small'});
  assert.ok(small.includes('heads') && !small.includes('refine'));
  const large = route({...defaults(), local:'many', difference:'large', lost:true});
  const order = ['target', 'refine', 'heads', 'sync', 'push', 'apply', 'repair', 'ready'].map(step => large.indexOf(step));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(!order.includes(-1));
});

test('a lost update is repaired by naming its entities again, after the pushes apply', () => {
  const kept = route({...defaults(), local:'few'});
  assert.ok(!kept.includes('repair'));
  const lost = route({...defaults(), local:'few', lost:true});
  assert.equal(lost.indexOf('repair'), lost.indexOf('apply') + 1);
  const repair = page({...defaults(), local:'few', lost:true, step:'repair'}).messages;
  assert.deepEqual(repair.map(message => message.type), [
    'NodeMessage::Request → NodeRequestBody::SyncEntities',
    'NodeMessage::Response → NodeResponseBody::EntitiesSynced',
    'NodeMessage::Update → NodeUpdateBody::SubscriptionUpdate',
  ]);
  assert.match(repair[0].body, /EntityHead \{ entity_id: C, head: \[\] \}/, 'an entity the copy lacks is named with an empty head');
});

test('invalid or stale fragment values cannot inject content or select an unreachable step', () => {
  assert.deepEqual(parseState('#local=<script>&cache=bogus&difference=oops&step=repair'), defaults());
  assert.equal(parseState('#local=many&difference=equal&step=push').step, 'lookup');
  assert.equal(parseState('#step=recheck', 'live').step, 'recheck');
  assert.equal(parseState('#step=lookup', 'live').step, 'subscribe');
});

test('an empty copy is offered as an empty inventory; a large one as span digests', () => {
  assert.match(knownState('none'), /Heads\(TreeSpanInventory/);
  assert.match(knownState('none'), /bounds: TreeSpan::all\(\)/);
  assert.match(knownState('none'), /heads: packed \[\]/);
  assert.match(knownState('many'), /Digest\(TreeSpanDigest/);
  const fetch = page({...defaults(), step:'request'}).messages;
  assert.equal(fetch.length, 1);
  assert.match(fetch[0].body, /known_state: KnownState/);
  assert.equal(fetch[0].reply, 'NodeResponseBody::Fetch(KnownState)');
});

test('the response carries the target and the data travels as updates', () => {
  const answer = page({...defaults(), local:'few', step:'compare'}).messages;
  assert.equal(answer.length, 1);
  assert.equal(answer[0].type, 'NodeMessage::Response → NodeResponseBody::Fetch(KnownState)');
  assert.doesNotMatch(answer[0].body, /SubscriptionUpdateItem/);
  const pushed = page({...defaults(), local:'few', step:'push'}).messages;
  assert.ok(pushed.length > 0);
  for (const message of pushed) {
    assert.equal(message.type, 'NodeMessage::Update → NodeUpdateBody::SubscriptionUpdate');
    assert.match(message.reply, /UpdateAck/);
    assert.match(message.body, /predicate_relevance: \[\]/, 'a Fetch’s pushes belong to no standing query');
  }
  const equal = page({...defaults(), local:'many', difference:'equal', step:'compare'}).messages;
  assert.equal(equal.length, 1, 'agreeing digests are answered with the target alone');
});

test('a live query installs before it compares, takes tagged initial data, checks itself and unsubscribes one-way', () => {
  const state = defaults('live');
  for (const step of route(state)) assert.equal(parseState(hashFor({...state, step}), 'live').step, step);
  for (const step of route(state)) for (const message of page({...state, step}).messages) assert.ok(protocolTypes.has(message.type), `${step}: ${message.type}`);
  const subscribe = page({...state, step:'subscribe'}).messages;
  assert.match(subscribe[0].body, /known_state: KnownState/);
  assert.equal(subscribe[1].type, 'NodeMessage::Response → NodeResponseBody::QuerySubscribed');
  assert.match(subscribe[1].body, /target: KnownState/);
  const initial = page({...state, step:'initial'}).messages;
  assert.match(initial[0].body, /\(Q, Initial\)/);
  const check = page({...state, step:'check'}).messages;
  assert.match(check[0].body, /questions: \[Heads\(TreeSpan::all\(\)\)\]/, 'a small copy is checked by its heads, not a digest');
  const recheck = page({...state, step:'recheck'}).messages.map(message => message.type);
  assert.ok(recheck.includes('NodeMessage::Request → NodeRequestBody::SyncEntities'));
  const unsubscribe = page({...state, step:'unsubscribe'}).messages;
  assert.equal(unsubscribe.length, 1);
  assert.equal(unsubscribe[0].type, 'NodeMessage::UnsubscribeQuery');
  assert.equal(unsubscribe[0].reply, 'None.');
});

test('guide links resolve to source pages or assets, with valid static fragments', () => {
  const source = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
  const guide = resolve(source, 'learn/synchronization');
  for (const name of ['index.html', 'livequery.html', 'reference.html']) {
    const html = readFileSync(resolve(guide, name), 'utf8');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${name}: duplicate IDs`);
    for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^https?:/.test(href)) continue;
      const [path, fragment] = href.split('#');
      let target = path ? resolve(guide, path) : resolve(guide, name);
      if (!existsSync(target) && target.endsWith('.html')) target = target.slice(0,-5)+'.md';
      assert.ok(existsSync(target), `${name}: missing ${href}`);
      if (fragment) assert.match(readFileSync(target,'utf8'), new RegExp(`id="${fragment}"`));
    }
  }
});
