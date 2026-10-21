import {defaults,route,parseState,hashFor,page,titles,selection} from './stories.mjs';
const lesson=document.body.dataset.lesson;
const root=document.querySelector('[data-guide]');
const nav=document.querySelector('[data-steps]');
let state=parseState(location.hash,lesson);
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function sequence(messages){
  const width=640,left=80,right=560,spacing=100,height=96+messages.length*spacing;
  const arrows=messages.map((message,i)=>{
    const y=100+i*spacing;
    const pushed=message.type.startsWith('NodeMessage::Update →');
    const returned=message.type.includes('Response')||message.type==='NodeMessage::UpdateAck';
    const from=message.direction==='right'?left:right,to=message.direction==='right'?right:left;
    const type=message.type.includes('NodeRequestBody::') ? 'Request → '+message.type.split('NodeRequestBody::')[1]
      : pushed ? 'Update → StateFrame'
      : message.type.includes('NodeResponseBody::') ? 'Response → '+message.type.split('NodeResponseBody::')[1].replace('(StateReply)','')
      : message.type.replace('NodeMessage::','');
    const description=[pushed?message.label:message.label.includes('frame 0')?'Frame 0':'',message.progress].filter(Boolean).join(' · ');
    return `<line x1="${from}" x2="${to}" y1="${y+48}" y2="${y+48}" stroke="${i===0?'var(--accent)':'var(--muted)'}" stroke-width="1.5" ${pushed||returned?'stroke-dasharray="4 4"':''} marker-end="url(#guide-${pushed?'open':'arrow'})"/>
      <rect x="112" y="${y-16}" width="416" height="56" fill="var(--surface)"/>
      <text x="320" y="${y}" text-anchor="middle">${escape(type)}</text>
      ${description?`<text class="message-detail" x="320" y="${y+22}" text-anchor="middle">${escape(description)}</text>`:''}`;
  }).join('');
  return `<div class="sequence"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="guide-sequence-title guide-sequence-description">
    <title id="guide-sequence-title">Messages for this step</title><desc id="guide-sequence-description">${escape(messages.map(m=>`${m.direction==='right'?'Requester to responder':'Responder to requester'}: ${m.type}, ${m.label}${m.progress?', '+m.progress:''}`).join('. '))}.</desc>
    <defs><marker id="guide-arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="context-stroke"/></marker><marker id="guide-open" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="context-stroke"/></marker></defs>
    <line x1="80" x2="80" y1="48" y2="${height-16}" stroke="var(--rule)" stroke-dasharray="4 4"/><line x1="560" x2="560" y1="48" y2="${height-16}" stroke="var(--rule)" stroke-dasharray="4 4"/>
    ${arrows}<rect x="16" y="8" width="128" height="40" rx="4" fill="var(--surface)" stroke="var(--rule)"/><rect x="496" y="8" width="128" height="40" rx="4" fill="var(--surface)" stroke="var(--rule)"/><text class="actor" x="80" y="36" text-anchor="middle">Requester</text><text class="actor" x="560" y="36" text-anchor="middle">Responder</text>
  </svg></div><p class="diagram-caption">One arrow per message shown. Time runs downward; spacing is not elapsed time. Exact types and fields are below.</p>`;
}
function visual(item){
  if(!item)return '';
  if(item.kind==='members')return `<div class="exhibit"><div class="two-nodes"><div class="node"><span class="name">Requester · local snapshot</span><p>${escape(item.left)}</p></div><div class="node"><span class="name">Responder · captured result</span><p>${escape(item.right)}</p></div></div></div>`;
  return `<div class="exhibit outcome"><strong>${escape(item.label)}</strong><p>${escape(item.detail)}</p></div>`;
}
function exact(messages){
  if(!messages.length)return '';
  return `<details class="detail"><summary>Exact message types, replies and payloads</summary><p class="note">Schematic fields, not literal bytes. IDs, keys, digests, attestation and clock contents are abbreviated. The common routing/auth envelope is omitted.</p>${messages.map((m,i)=>`<div class="wire-message"><h3>${i+1}. ${escape(m.label)}</h3><dl><dt>Type</dt><dd>${escape(m.type)}</dd><dt>Direct reply</dt><dd>${escape(m.reply)}</dd>${m.progress?`<dt>Progress</dt><dd><code>${escape(m.progress)}</code></dd>`:''}</dl><pre>${escape(m.body)}</pre></div>`).join('')}</details>`;
}
function navigate(next,focus=true){
  const previousStep=state.step;
  state={...next};
  const steps=route(state);
  if(!steps.includes(state.step))state.step=steps[0];
  history.pushState(null,'',hashFor(state));
  render(focus&&previousStep!==state.step);
}
function render(focus=false){
  const steps=route(state),index=steps.indexOf(state.step),content=page(state);
  nav.innerHTML=steps.map((id,i)=>`<li><a href="${escape(hashFor({...state,step:id}))}" ${id===state.step?'aria-current="step"':''}>${i+1}. ${escape(titles[id])}</a></li>`).join('');
  const choices=content.choices?`<fieldset class="choices"><legend>${escape(content.choices.label)}</legend><div class="choices-grid">${content.choices.options.map((option,i)=>`<button type="button" class="choice" data-choice="${i}" aria-pressed="${state[content.choices.field]===option.value}"><strong>${escape(option.label)}</strong><small>${escape(option.detail)}</small></button>`).join('')}</div></fieldset>`:'';
  const buttons=`<button class="button" data-back ${index===0?'disabled':''}>← Back</button>${index<steps.length-1?`<button class="button primary" data-next>Next: ${escape(titles[steps[index+1]])} →</button>`:'<button class="button" data-restart>Try another path</button>'}`;
  root.innerHTML=`<div class="stage-top"><span>${escape(content.context)} · <code>${selection}</code></span><span class="position">Step ${index+1} of ${steps.length}</span></div><h2 id="stage-title" tabindex="-1">${escape(content.title)}</h2><div class="actions actions-top">${buttons}</div>${content.paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}${choices}${visual(content.visual)}${content.messages.length?sequence(content.messages):''}${content.payload?`<details class="detail"><summary>${escape(content.payload.label)}</summary><pre>${escape(content.payload.body)}</pre></details>`:''}${exact(content.messages)}${content.note?`<p class="note">${escape(content.note)}</p>`:''}${content.end?`<a class="finish-link" href="${content.end.href}">${escape(content.end.label)} →</a>`:''}<div class="actions">${buttons}</div>`;
  root.querySelectorAll('[data-back]').forEach(button=>button.addEventListener('click',()=>navigate({...state,step:steps[index-1]})));
  root.querySelectorAll('[data-next]').forEach(button=>button.addEventListener('click',()=>navigate({...state,step:steps[index+1]})));
  root.querySelectorAll('[data-restart]').forEach(button=>button.addEventListener('click',()=>navigate(defaults(lesson))));
  root.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{
    const choice=content.choices.options[Number(button.dataset.choice)];
    navigate({...state,[content.choices.field]:choice.value},false);
    root.querySelector(`[data-choice="${button.dataset.choice}"]`).focus({preventScroll:true});
  }));
  if(focus)root.querySelector('#stage-title').focus({preventScroll:false});
  document.title=`${content.title} · ${lesson==='live'?'Live queries':'Fetch'} · Ankurah`;
}
nav.addEventListener('click',event=>{
  const anchor=event.target.closest('a');
  if(!anchor||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();navigate(parseState(anchor.hash,lesson));
});
document.querySelector('[data-reset]').addEventListener('click',()=>navigate(defaults(lesson)));
window.addEventListener('popstate',()=>{state=parseState(location.hash,lesson);render();});
window.addEventListener('hashchange',()=>{state=parseState(location.hash,lesson);render();});
render();
