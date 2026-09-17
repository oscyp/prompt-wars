const A = '../../../assets';
const portrait = `${A}/images/avatars/mystic.jpg`;
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name) => {
  const g = GLYPHS[name] || GLYPHS.quill;
  return `<svg class="icon" viewBox="0 0 64 64" aria-hidden="true">${g.body ? `<path d="${g.body}" fill="currentColor"/>` : ''}${g.detail ? `<path d="${g.detail}" fill="white" opacity=".22"/>` : ''}${g.lines ? `<path d="${g.lines}" fill="none" stroke="currentColor" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>` : ''}</svg>`;
};
const styles = [['comic','Comic Book'],['painterly','Painterly'],['anime','Anime'],['pixel','Pixel Art'],['oil','Oil Painting'],['lowpoly','Low Poly'],['darkfantasy','Dark Fantasy'],['vaporwave','Vaporwave']];
const palettes = [['Royal','#7051a8'],['Ember','#b8674c'],['Ocean','#367a96'],['Forest','#587757'],['Moonlight','#aaa7bd'],['Rose','#a64d78']];
const gear = [
  ['fountain_pen','Fountain Pen','Words made real'],['compass','Compass','Find your own way'],['hourglass','Hourglass','Make every moment count'],['crown_fragment','Crown Fragment','A story of lost kingdoms'],['briefcase','Briefcase','Business, with a twist'],['tarot_card','Tarot Card','A glimpse of the unknown'],['polaroid','Polaroid','A moment worth keeping'],['lucky_coin','Lucky Coin','A little personal magic'],['tuning_fork','Tuning Fork','Find your frequency'],['umbrella','Umbrella','Weather every storm'],['wrench','Wrench','Build something unexpected'],['microphone','Microphone','Make yourself heard'],['stopwatch','Stopwatch','Perfect timing'],['folding_chair','Folding Chair','Always take your place'],['megaphone','Megaphone','A voice that carries']
];
const description = 'A veiled mystic who writes constellations into the night. Silver ink drifts from her fountain pen.';
const configs = [
  ['look','01','Look, without the hidden drawer','Start with the choices','The fighter stays recognizable while art style, color and traits are available immediately. Scroll the controls normally.'],
  ['write','02','Space to write','Let the editor take the space','The preview becomes a compact identity row. Save and draw stay above the keyboard; your guided choices remain available.'],
  ['gear','03','A proper gear collection','Inspect, then choose','The current item has its own place. Browse artwork, open a preview and stage a new item before committing.']
];
const initial = (id) => ({id,tab:id==='gear'?'gear':id==='fighter'?'fighter':'look',mode:id==='write'?'write':'guided',keyboard:id==='write',style:'comic',palette:'Royal',traits:{Silhouette:'Cloaked',Outfit:'Celestial robes',Presence:'Mysterious'},item:'fountain_pen',savedItem:'fountain_pen',text:description,name:'Mira',cry:'Make every word count.',changes:2,allStyles:false,allGear:false,overlay:null,toast:null,scroll:0});
const query = new URLSearchParams(location.search).get('screen');
const single = ['look','write','gear','fighter'].includes(query);
if(single) document.body.classList.add('single');
const states = Object.fromEntries((single?[query]:['look','write','gear']).map(id=>[id,initial(id)]));
const gallery = document.getElementById('gallery');
gallery.innerHTML = Object.keys(states).map(id=>{
  const config = configs.find(c=>c[0]===id) || ['fighter','04','Fighter identity','Identity stays clear','Change name, archetype and battle cry without hunting through a drawer.'];
  return `<figure class="concept"><h2 class="concept-title"><span>${config[1]}</span>${config[2]}</h2><section class="phone" id="phone-${id}" aria-label="${config[2]} mockup"></section><figcaption><strong>${config[3]}</strong>${config[4]}</figcaption></figure>`;
}).join('');
function header(s){
  return `<div class="statusbar" aria-hidden="true"><span>9:41</span><span class="status-right"><span class="signal"><i></i><i></i><i></i><i></i></span>5G <span class="battery"></span></span></div><header class="nav"><button class="back" data-action="back" aria-label="Back to Profile">${icon('chevron-left')}</button><h2 class="screen-title">EDIT LOOK</h2><button class="credit" data-action="wallet" aria-label="Balance: 24 credits">${icon('crystal')}24</button></header>
  <section class="identity ${s.keyboard?'compact':''}" aria-label="Current fighter artwork"><div class="avatar-frame"><img class="portrait" src="${portrait}" alt="Mira, a mystic with a violet hood and luminous eyes"><img class="frame" src="${A}/cosmetics/frames/astral-codex-avatar.png" alt=""></div><div class="identity-meta"><div><p class="micro">CURRENT ARTWORK</p><h3 class="fighter-name">${esc(s.name)}</h3><p class="fighter-meta">Mystic · Astral Codex frame</p></div>${s.keyboard?`<button class="preview-link" data-action="portrait">${icon('look')}View card</button>`:`<div class="preview-links"><button class="preview-link" data-action="portrait">${icon('look')}View card</button><button class="previous-link" data-action="history">Previous looks</button></div>`}</div></section>
  <div class="tabs" role="tablist" aria-label="Editing category">${[['look','palette','Look'],['fighter','profile','Fighter'],['gear','hanger','Gear']].map(([id,g,label])=>`<button class="tab" role="tab" aria-selected="${s.tab===id}" data-action="tab" data-value="${id}">${icon(g)}${label}</button>`).join('')}</div>`;
}
function mode(s){return `<div class="mode" role="group" aria-label="Description mode"><button data-action="mode" data-value="guided" aria-pressed="${s.mode==='guided'}" aria-selected="${s.mode==='guided'}">${icon('palette')}Choose traits</button><button data-action="mode" data-value="write" aria-pressed="${s.mode==='write'}" aria-selected="${s.mode==='write'}">${icon('quill')}Write my own</button></div>`;}
function look(s){
  if(s.mode==='write') return `${mode(s)}<label class="field-label" for="text-${s.id}">Describe your fighter <small>Up to 200 characters</small></label><textarea id="text-${s.id}" data-field="text" maxlength="200" spellcheck="false">${esc(s.text)}</textarea><div class="field-caption"><span>Use this description for your next drawing.</span><span data-counter>${s.text.length}/200</span></div><button class="style-row" data-action="stylePicker"><img src="${A}/images/styles/${s.style}.jpg" alt=""><span>Art style<strong>${styles.find(v=>v[0]===s.style)[1]}</strong></span>${icon('chevron-right')}</button><details class="inactive-traits"><summary>Your guided choices are kept</summary><p>They return when you switch to Choose traits. While writing your own, this description is used instead.</p></details>`;
  return `${mode(s)}<div class="group-heading"><h3>Art style</h3><button class="styles-more" data-action="styles">${s.allStyles?'Show fewer':'View all 8'}</button></div><div class="style-grid">${(s.allStyles?styles:styles.slice(0,3)).map(([id,label])=>`<button class="style-tile ${s.style===id?'selected':''}" data-action="style" data-value="${id}" aria-pressed="${s.style===id}"><img src="${A}/images/styles/${id}.jpg" alt=""><span>${label}</span>${s.style===id?`<i class="selection-check">${icon('check')}</i>`:''}</button>`).join('')}</div><div class="group-heading"><h3>Color palette</h3><span>${s.palette}</span></div><div class="palette">${palettes.map(([name,color])=>`<button class="swatch ${s.palette===name?'selected':''}" style="--swatch:${color}" aria-label="${name} palette" aria-pressed="${s.palette===name}" data-action="palette" data-value="${name}">${s.palette===name?icon('check'):''}</button>`).join('')}</div>${Object.entries({Silhouette:['Cloaked','Slender','Broad','Towering'],Outfit:['Celestial robes','Light armor','Streetwear','Tailored suit'],Presence:['Mysterious','Bold','Calm','Playful']}).map(([group,options])=>`<details class="trait"><summary><span>${group}</span><span class="trait-value">${s.traits[group]}</span>${icon('chevron-right')}</summary><div class="choices">${options.map(v=>`<button class="choice ${s.traits[group]===v?'selected':''}" data-action="trait" data-group="${group}" data-value="${v}" aria-pressed="${s.traits[group]===v}">${v}</button>`).join('')}</div></details>`).join('')}<div class="secondary-actions"><button data-action="shuffle">${icon('replay')}Shuffle & draw · 5 cr</button><button data-action="discard">Reset changes</button></div>`;
}
function gearView(s){
  const item = gear.find(g=>g[0]===s.item);
  return `<div class="gear-current"><img class="item-art" src="${A}/signature-icons/${item[0]}.png" alt=""><div><p class="micro">${s.item===s.savedItem?'CURRENT SIGNATURE ITEM':'SELECTED · NOT DRAWN YET'}</p><h3>${item[1]}</h3><p>Part of your fighter’s identity.</p></div></div><div class="group-heading"><h3>Choose a signature item</h3><span>All choices are free</span></div><p class="note">A new drawing brings your chosen item into the artwork.</p><div class="gear-grid">${(s.allGear?gear:gear.slice(1,5)).map(([id,name])=>`<article class="gear-tile"><img class="item-art" src="${A}/signature-icons/${id}.png" alt=""><h3>${name}</h3><span class="kind">${s.item===id?'Selected':'Signature item'}</span><button class="gear-preview" data-action="gearPreview" data-value="${id}" aria-label="Preview ${name}">${icon('look')}Preview</button></article>`).join('')}</div><button class="browse-all" data-action="allGear">${s.allGear?'Show featured items':'Browse all 15 items'}${icon('chevron-right')}</button><p class="note">Cosmetic choices do not add stat bonuses.</p>`;
}
function fighter(s){return `<div class="identity-section"><label class="field-label" for="name-${s.id}">Fighter name</label><input id="name-${s.id}" data-field="name" maxlength="30" value="${esc(s.name)}"><p class="form-subtext">Your name appears on fighter cards and in battles.</p></div><div class="identity-section"><div class="field-label">Archetype</div><button class="archetype-row" data-action="archetype">${icon('mask')}<span>Mystic<small>Free identity preset</small></span>${icon('chevron-right')}</button><p class="form-subtext">An identity for your fighter. No hidden stat bonuses.</p></div><div class="identity-section"><label class="field-label" for="cry-${s.id}">Battle cry</label><input id="cry-${s.id}" data-field="cry" value="${esc(s.cry)}" maxlength="80"><p class="form-subtext">A short line with your fighter’s personality.</p></div><button class="browse-all" data-action="stats">${icon('profile')}View stat allocation${icon('chevron-right')}</button>`;}
function footer(s){return `<footer class="action-footer ${s.keyboard?'keyboard-footer':''}"><p class="footer-status">${icon(s.changes?'quill':'check')}<span data-status>${s.changes?'Unsaved changes · artwork unchanged':'Changes saved · current artwork kept'}</span></p><p class="footer-explain">Save your choices for free. Draw creates new artwork.</p><div class="footer-buttons"><button class="action secondary" data-action="save" ${s.changes?'':'disabled'}><span>Save changes<small>Free</small></span></button><button class="action primary" data-action="review">${icon('quill')}<span>Review & draw<small>3 credits</small></span></button></div><div class="home-indicator" aria-hidden="true"></div></footer>`;}
function keyboard(){return `<div class="keyboard" aria-label="Keyboard layout illustration"><div class="keyboard-toolbar"><button data-action="done">Done</button></div><div aria-hidden="true"><div class="keys">${'qwertyuiop'.split('').map(c=>`<span class="key">${c}</span>`).join('')}</div><div class="keys inset">${'asdfghjkl'.split('').map(c=>`<span class="key">${c}</span>`).join('')}</div><div class="keys"><span class="key wide">⇧</span>${'zxcvbnm'.split('').map(c=>`<span class="key">${c}</span>`).join('')}<span class="key wide">⌫</span></div><div class="keys"><span class="key wide">123</span><span class="key wide">◎</span><span class="key space">space</span><span class="key wide">return</span></div><div class="home-indicator"></div></div></div>`;}
function overlay(s){
  if(!s.overlay) return '';
  const {type,value} = s.overlay;
  let title='',body='',action='Back to editing',event='close';
  if(type==='portrait'){
    title='YOUR FIGHTER';body=`<p class="micro" style="text-align:center">CURRENT ARTWORK</p><div class="full-card"><img class="portrait" src="${portrait}" alt="Your current mystic artwork"><img class="frame" src="${A}/cosmetics/frames/astral-codex-portrait.png" alt="Astral Codex frame"></div><div class="card-caption"><h3>${esc(s.name)}</h3><p>Mystic · Astral Codex</p></div><p class="comparison-note">Your current artwork stays here while you edit.<br>Changes appear after a new drawing.</p>`;
  } else if(type==='gearPreview'){
    const [id,name,tagline]=gear.find(g=>g[0]===value); title='SIGNATURE ITEM';body=`<img class="modal-item" src="${A}/signature-icons/${id}.png" alt="${name}"><h3 class="modal-item-name">${name}</h3><p class="modal-description">${tagline}</p><div class="price-row"><span>Select this item</span><strong>Free</strong></div><div class="price-row"><span>New artwork with this item</span><strong>3 credits</strong></div><p class="comparison-note">Choosing an item stages it in the editor. It does not draw or spend credits.</p>`;action='Use this item · Free';event='chooseItem';
  } else if(type==='review'||type==='shuffle'){
    const shuffle=type==='shuffle';title=shuffle?'SHUFFLE & DRAW':'REVIEW YOUR LOOK';body=`<div class="review-note">${shuffle?'A fresh set of guided traits will be drawn. Your current unsaved choices will be replaced after confirmation.':'Your current artwork stays available. A new drawing uses the choices below.'}</div><div class="price-row"><span>Art style</span><strong>${styles.find(v=>v[0]===s.style)[1]}</strong></div><div class="price-row"><span>Description</span><strong>${s.mode==='write'?'Your own writing':'Guided traits'}</strong></div><div class="price-row"><span>Signature item</span><strong>${gear.find(g=>g[0]===s.item)[1]}</strong></div><div class="price-row"><span>Drawing cost</span><strong>${shuffle?5:3} credits</strong></div><div class="price-row"><span>Balance after drawing</span><strong>${shuffle?19:21} credits</strong></div><p class="comparison-note">Visual prototype: confirmation demonstrates the flow.<br>No artwork will be generated and no credits will be spent.</p>`;action=`${shuffle?'Shuffle & draw':'Draw new look'} · ${shuffle?5:3} credits`;event='confirmDraw';
  } else if(type==='history'){
    title='PREVIOUS LOOKS';body=`<p class="note" style="margin-bottom:16px">Review available artwork before restoring it. Your editing choices stay in the editor.</p><div class="previous-grid"><article class="previous-card"><img src="${portrait}" alt="Current mystic artwork"><strong>Current look</strong><span>Painterly · Ember</span></article><article class="previous-card"><img src="${A}/images/archetypes/mystic.jpg" alt="Earlier sample mystic artwork"><strong>Earlier look</strong><span>Sample artwork</span><button class="gear-preview" data-action="restore">Preview restoration</button></article></div><p class="comparison-note">Illustrative history using bundled artwork. Production will show only your available renders.</p>`;
  } else if(type==='stylePicker'){
    title='ART STYLE';body=`<div class="style-grid">${styles.map(([id,label])=>`<button class="style-tile ${id===s.style?'selected':''}" data-action="pickStyle" data-value="${id}" aria-pressed="${id===s.style}"><img src="${A}/images/styles/${id}.jpg" alt=""><span>${label}</span></button>`).join('')}</div>`;
  } else if(type==='archetype'){
    title='MYSTIC';body=`<img src="${A}/images/archetypes/mystic.jpg" alt="Mystic artwork" style="width:100%;border-radius:5px"><p class="modal-description">A keeper of secrets, symbols and unexpected possibilities.</p><div class="review-note">Archetypes are free identity presets. They do not add unlisted bonuses. Existing change limits and battle locks still apply.</div>`;
  } else if(type==='stats'){
    title='FIGHTER STATS';body=`${['Strength','Stamina','Agility','Focus'].map(v=>`<div class="price-row"><span>${v}</span><strong>5 / 10</strong></div>`).join('')}<p class="comparison-note">Balanced starter build · 20 points.<br>The existing allocation and respec flow remains available in the app.</p>`;
  } else if(type==='wallet'){
    title='YOUR CREDITS';body=`<h3 class="modal-item-name" style="margin:40px 0">${icon('crystal')} 24 credits</h3><p class="modal-description">Saving choices is free.<br>Review the full cost before drawing.</p><p class="comparison-note">This prototype uses an illustrative balance and prices. The app uses server entitlements and actual render allowances.</p>`;
  } else if(type==='discard'){
    title='RESET CHANGES?';body=`<p class="modal-description">Return to the saved choices for this fighter. Your current artwork stays the same.</p><div class="review-note">This also clears the written draft in this mockup. Cancel by closing this screen.</div>`;action='Reset unsaved choices';event='confirmDiscard';
  } else if(type==='restore'){
    title='RESTORE THIS LOOK?';body=`<img src="${A}/images/archetypes/mystic.jpg" alt="Previous sample look" style="width:100%;border-radius:5px"><p class="modal-description">Restoring available artwork is free. Your current editing draft is kept.</p><p class="comparison-note">Prototype preview only. No fighter artwork is changed.</p>`;action='Restore look · Free';event='confirmRestore';
  }
  return `<section class="overlay" role="dialog" aria-modal="true" aria-label="${title}"><header class="overlay-header"><h2>${title}</h2><button class="overlay-close" data-action="close" aria-label="Close preview">${icon('close')}</button></header><div class="overlay-body">${body}</div><footer class="overlay-footer"><button class="action primary" data-action="${event}">${action}</button><div class="home-indicator" aria-hidden="true"></div></footer></section>`;
}
function render(s){
  const phone=document.getElementById(`phone-${s.id}`);
  const opened = [...phone.querySelectorAll('.trait[open]')].map(n=>n.querySelector('summary>span').textContent);
  phone.classList.toggle('keyboard-open',s.keyboard);
  phone.innerHTML = `${header(s)}<main class="editor-body" tabindex="0" aria-label="${s.tab} editing controls">${s.tab==='look'?look(s):s.tab==='gear'?gearView(s):fighter(s)}</main>${footer(s)}${s.keyboard?keyboard():''}${overlay(s)}${s.toast?`<div class="toast" role="status">${esc(s.toast)}</div>`:''}`;
  phone.querySelector('.editor-body').scrollTop=s.scroll;
  phone.querySelectorAll('.trait').forEach(n=>{n.open=opened.includes(n.querySelector('summary>span').textContent);});
  if(s.overlay){
    [...phone.children].filter(n=>!n.classList.contains('overlay')&&!n.classList.contains('toast')).forEach(n=>n.inert=true);
    phone.querySelector('.overlay-close').focus({preventScroll:true});
  }
}
function toast(s,message){s.toast=message;render(s);clearTimeout(s.timer);s.timer=setTimeout(()=>{s.toast=null;render(s);},3800);}
gallery.addEventListener('click',e=>{
  const b=e.target.closest('button[data-action]');if(!b)return;
  const phone=b.closest('.phone');const s=states[phone.id.replace('phone-','')];
  s.scroll=phone.querySelector('.editor-body').scrollTop;
  const {action,value,group}=b.dataset;
  if(action==='tab'){s.tab=value;s.keyboard=false;s.scroll=0;}
  else if(action==='mode'){s.mode=value;s.keyboard=value==='write'&&s.id==='write';s.scroll=0;}
  else if(action==='style'||action==='palette'){s[action]=value;s.changes++;}
  else if(action==='trait'){s.traits[group]=value;s.changes++;}
  else if(action==='styles')s.allStyles=!s.allStyles;
  else if(action==='allGear')s.allGear=!s.allGear;
  else if(action==='done')s.keyboard=false;
  else if(action==='save'){s.changes=0;s.savedItem=s.item;toast(s,'Choices saved in this mockup. Current artwork kept.');return;}
  else if(action==='close'){s.overlay=null;render(s);phone.querySelector('.tab[aria-selected="true"]').focus({preventScroll:true});return;}
  else if(action==='chooseItem'){s.item=s.overlay.value;s.changes++;s.overlay=null;toast(s,'Item selected. Save it for free, or review a new drawing.');return;}
  else if(action==='pickStyle'){s.style=value;s.changes++;s.overlay=null;}
  else if(action==='confirmDraw'){s.overlay=null;toast(s,'The drawing would start here. This mockup spends no credits.');return;}
  else if(action==='confirmRestore'){s.overlay=null;toast(s,'Restoration preview complete. No account artwork was changed.');return;}
  else if(action==='confirmDiscard'){Object.assign(s,initial(s.id),{style:'painterly',palette:'Ember',text:'',changes:0,overlay:null});}
  else if(action==='back'){toast(s,'Back returns to Profile. Unsaved changes would be kept as a draft.');return;}
  else{s.overlay={type:action,value};s.keyboard=false;}
  render(s);
});
gallery.addEventListener('input',e=>{
  if(!e.target.dataset.field)return;
  const phone=e.target.closest('.phone');const s=states[phone.id.replace('phone-','')];
  s[e.target.dataset.field]=e.target.value;s.changes++;
  const counter=phone.querySelector('[data-counter]');if(counter)counter.textContent=`${s.text.length}/200`;
  phone.querySelector('[data-status]').textContent='Unsaved changes · artwork unchanged';
  phone.querySelector('[data-action="save"]').disabled=false;
  if(e.target.dataset.field==='name')phone.querySelector('.fighter-name').textContent=s.name;
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')Object.values(states).forEach(s=>{if(s.overlay){s.overlay=null;render(s);}});});
document.getElementById('reset').addEventListener('click',()=>Object.keys(states).forEach(id=>{clearTimeout(states[id].timer);states[id]=initial(id);render(states[id]);}));
Object.values(states).forEach(render);
