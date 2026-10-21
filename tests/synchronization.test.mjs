import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaults, route, parseState, hashFor, page, knownState} from '../src/learn/synchronization/stories.mjs';

test('every branch can be bookmarked and renders a complete lesson', () => {
  for (const cache of ['hit', 'miss']) {
    for (const local of ['none', 'few', 'many']) {
      for (const difference of ['equal', 'small', 'large']) {
        for (const repair of [false, true]) {
          const state = {...defaults(), cache, local, difference, repair};
          const steps = route(state);
          assert.equal(new Set(steps).size, steps.length);
          assert.equal(steps.at(-1), 'finish');
          for (const step of steps) {
            const selected = {...state, step};
            assert.deepEqual(parseState(hashFor(selected)), selected);
            const content = page(selected);
            assert.ok(content.title && content.paragraphs.length > 0);
            assert.ok(content.visual || content.messages.length || content.choices);
            for (const message of content.messages) {
              assert.ok(message.type && message.reply && message.body);
              assert.ok(['left', 'right'].includes(message.direction));
            }
          }
        }
      }
    }
  }
});

test('empty, equal, small-difference and large-difference paths ask different questions', () => {
  const empty = route(defaults());
  assert.ok(empty.includes('transfer'));
  assert.ok(!empty.includes('heads') && !empty.includes('refine'));
  const equal = route({...defaults(), local:'many', difference:'equal', repair:true});
  assert.ok(equal.includes('equal'));
  assert.ok(!equal.includes('transfer') && !equal.includes('repair'));
  const small = route({...defaults(), local:'many', difference:'small'});
  assert.ok(small.includes('heads') && !small.includes('refine'));
  const large = route({...defaults(), local:'many', difference:'large', repair:true});
  assert.ok(large.indexOf('refine') < large.indexOf('heads'));
  assert.ok(large.indexOf('apply') < large.indexOf('repair'));
  assert.ok(large.indexOf('repair') < large.indexOf('ready'));
});

test('invalid or stale fragment values cannot inject content or select an unreachable step', () => {
  assert.deepEqual(parseState('#local=<script>&cache=bogus&difference=oops&step=repair'), defaults());
  assert.equal(parseState('#local=many&difference=equal&step=transfer').step, 'lookup');
  assert.equal(parseState('#step=overlap', 'live').step, 'overlap');
  assert.equal(parseState('#step=lookup', 'live').step, 'subscribe');
});

test('empty knowledge is explicit inventory coverage; equality sends no entity data', () => {
  assert.match(knownState('none'), /Heads\(TreeSpanInventory/);
  assert.match(knownState('none'), /bounds: TreeSpan::full\(\)/);
  assert.match(knownState('none'), /heads: packed \[\]/);
  assert.match(knownState('many'), /Digest\(TreeSpanDigest/);
  const result = page({...defaults(), local:'many', difference:'equal', step:'equal'});
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0].body, /items: \[\]/);
  assert.equal(result.messages[0].progress, 'progress: Complete');
});

test('live lesson keeps the round, live publication, and teardown claims distinct', () => {
  const state = defaults('live');
  for (const step of route(state)) assert.equal(parseState(hashFor({...state,step}), 'live').step, step);
  const initial = page({...state, step:'subscribe'}).messages;
  assert.match(initial[0].body, /known_state: KnownState/);
  assert.match(initial[1].reply, /^None/);
  assert.equal(initial[1].progress, 'progress: Continue');
  const live = page({...state, step:'overlap'}).messages[0];
  assert.match(live.body, /revision: 101/);
  assert.equal(live.progress, 'complete: true');
  const finish = page({...state, step:'ready-live'}).messages[0];
  assert.match(finish.type, /NodeRequestBody::FinishStateRound/);
  assert.equal(finish.reply, 'NodeResponseBody::Success');
  const abandon = page({...state, step:'close'}).messages;
  assert.equal(abandon.length, 1);
  assert.equal(abandon[0].type, 'NodeMessage::AbandonStateStream');
  assert.equal(abandon[0].reply, 'None.');
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
