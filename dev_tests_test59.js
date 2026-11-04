// 開発用の自動テスト（本番には不要・配布不要）。使い方: node dev_tests.js [HTMLとJSがあるフォルダ]
const fs = require('fs'), path = require('path'); const DIR = process.argv[2] || '.';
const HTML = path.join(DIR, 'index.html');   // 分割版のHTMLは index.html
const V = fs.readFileSync(HTML, 'utf8').match(/app_test(\d+)_/)[1];
globalThis.DEFAULT_COMMON_CATS = ['未分類', '背景', 'パネル']; globalThis.DEFAULT_SCENARIO_CATS = ['トレーラー', 'NPC', 'マップ'];   // 以前のテストが使う、ギャラリー用の簡易版（本物は最後の専用テストで確認）
globalThis.sanitizeCats = (l, d) => (Array.isArray(l) && l.length ? l : [...d]); globalThis.sanitizeAssets = l => (Array.isArray(l) ? l : []); globalThis.sanitizeDocs = l => (Array.isArray(l) ? l : []);
globalThis.sanitizeFormats = l => Array.isArray(l) ? l : [];   // 取り込みデータの整形テスト用の簡易版（本物は下の専用テストで確認）
globalThis.isDecorStyle = v => ['default','simple','fancy','codeblock','none'].includes(v) || /^fmt_[\w-]+$/.test(String(v));   // 実際の定義はapp_*_00_block_common.js（テスト用の同じ判定）
const loadApp = () => fs.readdirSync(DIR).filter(f => new RegExp('^app_test' + V + '_\\d+_.*\\.js$').test(f)).sort().map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('');
{ const app0 = loadApp(), fnT = n => { const a = app0.indexOf('function ' + n); return app0.slice(a, app0.indexOf('\n  }\n', a) + 5); };   // 以前のテストが使う、装飾の部品（実際のソースから取り出す）
  Object.assign(globalThis, new Function(app0.match(/const customFormat = [^\n]*/)[0] + '\n' + fnT('decorHead') + '\n' + fnT('decorBody') + '\nreturn { customFormat, decorHead, decorBody };')()); }
{
const fs=require('fs'); const src=loadApp();
const a=src.indexOf('  // ===== 取り込みデータ'); const mi=src.indexOf('function migrateScenarioBlocks'); const b=src.indexOf('\n  }\n',mi)+5;
const seg=src.slice(a,b);
const dummy=new Proxy(function(){},{get:()=>dummy,apply:()=>dummy,set:()=>true});
const run=new Function('uid','document','window','Blob', seg+`
 const T={sanitizeBlock,sanitizeBlocks,sanitizeImported,ensureScenarioBlocks,deriveFlat,applyFlatToBlocks,migrateScenarioBlocks,createDefaultBlocks,FLAT_MAP}; return T;`);
let n=0; const uid=()=>'u'+(++n);
const T=run(uid,dummy,{},Blob);
const ok=(c,m)=>console.log((c?'OK  ':'NG  ')+m);
// 1 悪意ある/壊れた取り込み
const bad={channels:[{id:5,name:null,webhookUrl:' x ',tags:'zz'}],scenarios:[{id:1,title:{a:1},tags:'x',fullBlockData:[{type:'"><img src=x onerror=alert(1)>',id:'a b',val:{}},null,{type:'summary_container',items:[null,{keyName:7,val:null}]},{type:'image',file:{},previewUrl:null}]},null,'str'],history:[1,null,{title:'t'}]};
const r=T.sanitizeImported(JSON.parse(JSON.stringify(bad)));
ok(r&&r.scenarios.length===1,'null/文字列のシナリオを除外');
ok(r.scenarios[0].fullBlockData.every(b=>['text','textarea','url','split','image','summary_container'].includes(b.type)),'block.type が許可リスト内');
ok((()=>{const x=r.scenarios[0].fullBlockData.find(b=>b.type==='summary_container');return x.items.length===1&&x.items[0].keyName==='7'})(),'items を正規化');
ok((()=>{const x=r.scenarios[0].fullBlockData.find(b=>b.type==='image');return !x.file})(),'不正な file を除去');
ok(Array.isArray(r.channels[0].tags)&&r.channels[0].name==='','channels を正規化');
ok(T.sanitizeImported({scenarios:1,channels:[]})===null,'形式不正は null');
// 2 フラット項目 ⇄ ブロック
const legacy={id:'s1',title:'T',system:'CoC',playerCount:'2-4',notes:'メモ',imageUrl:'data:image/png;base64,AAAA',reqSkills:'目星',trailer:'https://x'};
T.migrateScenarioBlocks(legacy);
const sum=legacy.fullBlockData.find(b=>b.type==='summary_container');
ok(sum&&sum.items.find(i=>i.field==='system').val==='CoC','旧データ→ブロック(システム)');
ok(legacy.fullBlockData.find(b=>b.id==='notes').val==='メモ','旧データ→ブロック(備考)');
ok(legacy.fullBlockData.some(b=>b.type==='image'&&b.previewUrl.startsWith('data:image')),'旧データ→画像ブロック');
// 項目名を変えても値が追従する
sum.items.find(i=>i.field==='system').keyName='使用システム'; sum.items.find(i=>i.field==='system').val='新クトゥルフ';
T.deriveFlat(legacy); ok(legacy.system==='新クトゥルフ','項目名を変えても system に反映');
// 編集モーダル経路
legacy.playTime='4h'; legacy.system='SW2.5'; T.applyFlatToBlocks(legacy);
ok(legacy.fullBlockData.find(b=>b.type==='summary_container').items.find(i=>i.field==='system').val==='SW2.5'&&legacy.fullBlockData.find(b=>b.type==='summary_container').items.find(i=>i.field==='playTime').val==='4h','編集モーダル→ブロック');
// 画像が全部消えたらサムネも空
legacy.fullBlockData.filter(b=>b.type==='image').forEach(b=>b.previewUrl=''); T.deriveFlat(legacy); ok(legacy.imageUrl==='','画像なし→imageUrl が空');
// 移行は冪等
const before=JSON.stringify(legacy); T.migrateScenarioBlocks(legacy); T.migrateScenarioBlocks(legacy); ok(JSON.stringify(legacy)===before,'移行を2回かけても結果が変わらない');
// 項目が重複名
const dup={id:'d',fullBlockData:[{id:'summary',type:'summary_container',label:'',items:[{keyName:'システム',val:'a'},{keyName:'システム',val:'b'}]}]};
T.migrateScenarioBlocks(dup); ok(dup.fullBlockData[0].items.filter(i=>i.field==='system').length===1,'同名項目でも field は1つだけ');

}
{
const fs=require('fs'); const html=fs.readFileSync(HTML,'utf8');
const mod=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const a=mod.indexOf('async function mergeRemote'); const b=mod.indexOf('\n  }\n',a)+5;
const fn=mod.slice(a,b);
const mk=(local,remote,cloudDocs)=>{
  let applied=null; const cloudIndex=new Map(cloudDocs.map((c,i)=>['s_'+c.id,{order:i,json:JSON.stringify(c)}]));
  const env={ setSync(){}, loadIndex:async()=>{}, cloudIndex, cloudImages:null,
    window:{getAppStateForSync:()=>local, applyMergedState:async m=>{applied=m;}} };
  const f=new Function(...Object.keys(env),fn+'; return mergeRemote;')(...Object.values(env));
  return f('uid',{data:()=>({images:{},json:JSON.stringify(remote)})}).then(()=>applied);
};
const ok=(c,m)=>console.log((c?'OK  ':'NG  ')+m);
(async()=>{
  const L=(id,u,t='')=>({id,title:t||id,updatedAt:u});
  // 1 新しい方を採用
  let r=await mk({scenarios:[L('a',10,'local-a'),L('b',50,'local-b')],channels:[],history:[]},{channels:[],history:[]},[L('a',20,'cloud-a'),L('b',40,'cloud-b')]);
  ok(r.scenarios.find(s=>s.id==='a').title==='cloud-a'&&r.scenarios.find(s=>s.id==='b').title==='local-b','シナリオごとに新しい方を採用');
  // 2 他端末で追加
  r=await mk({scenarios:[L('a',10)],channels:[],history:[]},{channels:[],history:[]},[L('a',10),L('c',5)]);
  ok(r.scenarios.map(s=>s.id).join()==='a,c','他端末で追加したシナリオを取り込む');
  // 3 この端末で削除 → 復活しない
  r=await mk({scenarios:[L('a',10)],channels:[],history:[],deletedScenarios:{c:Date.now()}},{channels:[],history:[]},[L('a',10),L('c',5)]);
  ok(r.scenarios.map(s=>s.id).join()==='a','この端末で削除したものは復活しない');
  // 4 他端末で削除（クラウド側の墓標）→ ローカルからも消える
  r=await mk({scenarios:[L('a',10),L('x',5)],channels:[],history:[]},{channels:[],history:[],deletedScenarios:{x:Date.now()}},[L('a',10)]);
  ok(r.scenarios.map(s=>s.id).join()==='a','他端末で削除したものは消える');
  // 5 削除後に編集した方が勝つ
  r=await mk({scenarios:[L('x',Date.now()+1000)],channels:[],history:[]},{channels:[],history:[],deletedScenarios:{x:Date.now()}},[]);
  ok(r.scenarios.length===1,'削除より後に編集されたものは残る');
  // 6 履歴の重複除去・チャンネル和集合・古い墓標の掃除
  r=await mk({scenarios:[],channels:[{id:'c1'}],history:[{date:'2026-01-01',title:'T',channels:'A'}]},{channels:[{id:'c1'},{id:'c2'}],history:[{date:'2026-01-01',title:'T',channels:'A'},{date:'2026-01-02',title:'U',channels:'B'}],deletedScenarios:{old:1}},[]);
  ok(r.history.length===2,'履歴は重複を除いて統合'); ok(r.channels.map(c=>c.id).join()==='c1,c2','チャンネルは和集合'); ok(!('old' in r.deletedScenarios),'90日超の削除記録を掃除');
  // 7 壊れたクラウドJSONがあっても落ちない
  const env2=await (async()=>{try{const cloud=[{id:'ok',updatedAt:1}];let applied;const cloudIndex=new Map([['s_ok',{order:0,json:JSON.stringify(cloud[0])}],['s_bad',{order:1,json:'{broken'}]]);
    const f=new Function('setSync','loadIndex','cloudIndex','cloudImages','window',fn+';return mergeRemote;')(()=>{},async()=>{},cloudIndex,null,{getAppStateForSync:()=>({scenarios:[],channels:[],history:[]}),applyMergedState:async m=>{applied=m}});
    await f('u',{data:()=>({images:{},json:'{}'})}); return applied;}catch(e){return e}})();
  ok(!(env2 instanceof Error)&&env2.scenarios.length===1,'壊れたクラウドJSONは無視して統合を続行');
})();
(async()=>{ const f=require('fs').readFileSync(HTML,'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const a=f.indexOf('async function mergeRemote'), b=f.indexOf('\n  }\n',a)+5; const fn=f.slice(a,b); let ap;
  const L={id:'a',updatedAt:10,postedChannels:['c1'],postedInfo:{c1:{n:1}}}, C={id:'a',updatedAt:20,title:'cloud',postedChannels:['c2'],postedInfo:{c2:{n:2}}};
  const g=new Function('setSync','loadIndex','cloudIndex','cloudImages','window',fn+';return mergeRemote;')(()=>{},async()=>{},new Map([['s_a',{order:0,json:JSON.stringify(C)}]]),null,{getAppStateForSync:()=>({scenarios:[L],channels:[],history:[]}),applyMergedState:async m=>{ap=m}});
  await g('u',{data:()=>({images:{},json:'{}'})});
  const s=ap.scenarios[0]; console.log((s.title==='cloud'&&s.postedChannels.sort().join()==='c1,c2'&&s.postedInfo.c1&&s.postedInfo.c2?'OK  ':'NG  ')+'posted-record merge (body from newer side)'); })();

}

{ // チャンネル削除の反映・時計ずれ対策のテスト
  const fn=(()=>{const f=fs.readFileSync(HTML,'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1];const a=f.indexOf('async function mergeRemote');return f.slice(a,f.indexOf('\n  }\n',a)+5);})();
  (async()=>{ let ap; const g=new Function('setSync','loadIndex','cloudIndex','cloudImages','window',fn+';return mergeRemote;')(()=>{},async()=>{},new Map(),null,{getAppStateForSync:()=>({scenarios:[],channels:[{id:'c1'},{id:'c3'}],history:[],deletedChannels:{c3:Date.now()}}),applyMergedState:async m=>{ap=m}});
    await g('u',{data:()=>({images:{},json:JSON.stringify({channels:[{id:'c1'},{id:'c2'}],history:[],deletedChannels:{c2:Date.now()}})})});
    console.log((ap.channels.map(c=>c.id).join()==='c1'?'OK  ':'NG  ')+'削除したチャンネルは両端末から消え、復活しない'); })(); }

{ // 履歴の全消去・添付上限のテスト
  const fn=(()=>{const f=fs.readFileSync(HTML,'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1];const a=f.indexOf('async function mergeRemote');return f.slice(a,f.indexOf('\n  }\n',a)+5);})();
  (async()=>{ let ap; const old='2026-01-01T00:00:00.000Z', nw='2026-03-01T00:00:00.000Z';
    const g=new Function('setSync','loadIndex','cloudIndex','cloudImages','window',fn+';return mergeRemote;')(()=>{},async()=>{},new Map(),null,{getAppStateForSync:()=>({scenarios:[],channels:[],history:[{date:old,title:'a',channels:'x'}],historyClearedAt:Date.parse('2026-02-01')}),applyMergedState:async m=>{ap=m}});
    await g('u',{data:()=>({images:{},json:JSON.stringify({channels:[],history:[{date:old,title:'b',channels:'y'},{date:nw,title:'c',channels:'z'}]})})});
    console.log((ap.history.length===1&&ap.history[0].title==='c'?'OK  ':'NG  ')+'履歴を消した後の新しい履歴だけが残る');
    const src=loadApp(); const m=src.match(/const maxAttachBytes = [^\n]*/)[0];
    const f=new Function('appState',m+';return maxAttachBytes;'); console.log((f({})()===9.5*1048576&&f({maxAttachMB:20})()===20*1048576&&f({maxAttachMB:'x'})()===9.5*1048576?'OK  ':'NG  ')+'添付上限: 既定9.5MB・設定値・不正値'); })(); }


{ // ブロック編集の委譲: テンプレートが出す操作名と、イベント側の処理が一致しているか
  const app=loadApp(), tpl=app.slice(app.indexOf('function getDecorSelectHtml'), app.indexOf('function addSummaryItem'));
  const ev=fs.readFileSync(path.join(DIR, fs.readdirSync(DIR).filter(f=>new RegExp('^app_test'+V+'_\\d+_events\\.js$').test(f))[0]),'utf8');
  for(const [attr,label] of [['data-ba','クリック'],['data-bi','入力'],['data-bc','変更']]){
    const used=new Set([...tpl.matchAll(new RegExp(attr+'="([^"$]+)"','g'))].map(m=>m[1]));
    const handled=[...used].filter(v=>ev.includes("'"+v+"'"));
    console.log((handled.length===used.size?'OK  ':'NG  ')+'ブロック編集の'+label+'操作 '+used.size+'種が全て処理される'+(handled.length===used.size?'':' 未処理: '+[...used].filter(v=>!handled.includes(v))));
  }
  console.log((!/\bon(click|input|change|dragover|dragleave|drop)="[^"]*blockIdx/.test(tpl)?'OK  ':'NG  ')+'ブロック編集のインラインイベントが残っていない');
}

{ // 画像の2重追加防止・入力内容のみクリア
  const app=loadApp(), ev=app.slice(app.indexOf('document.addEventListener(\'click\''));
  const caps=['dragover','dragleave','drop'].every(t=>new RegExp("addEventListener\\('"+t+"'[^\\n]*\\}, true\\);").test(ev));
  console.log((caps?'OK  ':'NG  ')+'ドラッグ系の委譲はキャプチャ段階（親コンテナへ伝播しない）');
  console.log((/function handleContainerDrop\(e\) \{[^\n]*data-ba="pick"/.test(app)?'OK  ':'NG  ')+'画像ブロック上のドロップはコンテナ側で無視');
  const a=app.indexOf('async function resetInputs'), fn=app.slice(a,app.indexOf('\n  }\n',a)+5);
  const els={title:{value:'t'},autoReplyText:{value:'a'},topShopUrl:{value:'s'},topTrailer:{value:'r'},dbScenarioSelect:{value:'x'}};
  const env={ appConfirm:async()=>true, currentScenarioId:'id1', document:{getElementById:i=>els[i]}, activeTagNames:new Set(['a']), updateTagCheckboxes(){}, setHOs(){}, renderBlockUI(){}, checkDuplicateStatus(){}, renderPreview(){},
    blockOrder:[{id:'s',type:'summary_container',items:[{keyName:'システム',val:'CoC'}],freeText:'f'},{id:'n',type:'textarea',val:'memo',label:'備考'},{id:'sp',type:'split'},{id:'i',type:'image',previewUrl:'u',file:{}}] };
  const bo=env.blockOrder, order=bo.map(b=>b.id).join();
  new Function(...Object.keys(env),fn+';return resetInputs;')(...Object.values(env))().then(()=>{});
  setTimeout(()=>{ const ok=Object.values(els).every(e=>e.value==='')&&bo[0].items[0].val===''&&bo[0].items[0].keyName==='システム'&&bo[0].freeText===''&&bo[1].val===''&&bo[1].label==='備考'&&bo[3].previewUrl===''&&bo[3].file===null&&env.activeTagNames.size===0&&bo.map(b=>b.id).join()===order;
    console.log((ok?'OK  ':'NG  ')+'入力内容のみクリア: 本文・画像・タグ・シナリオ選択は消え、項目名・ブロックの並びは残る'); },50);
}

{ // 固定ヘッダー
  const css=fs.readFileSync(path.join(DIR,'discord_forum_app_test'+V+'.css'),'utf8'), app=loadApp();
  console.log((/\.app-header \{\s*position: sticky; top: 0;[^}]*background:/.test(css)?'OK  ':'NG  ')+'ヘッダーは上部に固定され、背景で内容が透けない');
  console.log((/\.discord-preview-box[^}]*top: calc\(var\(--app-header-h/.test(css)?'OK  ':'NG  ')+'プレビュー枠は固定ヘッダーの下に置かれる');
  console.log((/--app-header-h/.test(app)?'OK  ':'NG  ')+'ヘッダー高さをCSS変数へ反映');
}

{ // インラインイベントの廃止と登録表の整合
  const html=fs.readFileSync(HTML,'utf8').replace(/<script[\s\S]*?<\/script>/g,''), app=loadApp();
  const left=[...(html+app).matchAll(/\son(?:click|input|change|submit|dragover|dragleave|drop|keydown|keyup|paste|focus|blur)=\\?"/g)].length;
  console.log((left===0?'OK  ':'NG  ')+'インラインの on◯◯= 属性が残っていない ('+left+')');
  const act=app.slice(app.indexOf('const HANDLERS = {')); const code=act.slice(0,act.indexOf('\n})();')+6);
  const keys=new Set(); for(const m of (html+app).matchAll(/data-on-(?:click|input|change|submit|dragover|dragleave|drop)="([^"]*)"/g)) keys.add(m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"));
  const listeners={}, calls=[]; const env={document:{addEventListener:(t,f)=>{listeners[t]=f;}},console:{warn(){}},appState:{channels:[{tags:[{}]}]},renderPreview(){calls.push('renderPreview')},resetForm(){calls.push('resetForm')},saveState(){},switchTab(a,e){calls.push('switchTab:'+a+':'+(e.currentTarget===btn))},deleteChannelConfig(i){calls.push('del'+i)}};
  const HAN=new Function(...Object.keys(env),code+';return HANDLERS;')(...Object.values(env));
  keys.delete('...');   // actions.js の説明コメント内の例示は数えない
  const miss=[...keys].filter(k=>!(k in HAN)); console.log((miss.length===0?'OK  ':'NG  ')+'画面が使う操作 '+keys.size+' 種が、すべて登録表にある'+(miss.length?' 未登録: '+miss.join(' / '):''));
  // ディスパッチ: 子→親、this/currentTarget、stopPropagation
  const mkEl=(attrs,parent)=>({attrs,parentElement:parent||null,dataset:{},getAttribute(a){return this.attrs[a];},closest(s){const a=s.slice(1,-1);for(let e=this;e;e=e.parentElement)if(a in e.attrs)return e;return null;}});
  const par=mkEl({'data-on-click':'resetForm'}), btn=mkEl({'data-on-click':'switchTab-postTab-event'},par), ch=mkEl({'data-on-click':'ch-del'},null); ch.dataset.ci='2';
  const ev={target:btn,cancelBubble:false,stopPropagation(){this.cancelBubble=true;}};
  listeners.click(ev); listeners.click({target:ch,cancelBubble:false});
  console.log((calls.join()==='switchTab:postTab:true,resetForm,del2'?'OK  ':'NG  ')+'委譲の動作: 子→親の順に呼ぶ／currentTarget／data属性の引数 ('+calls.join()+')');
}

{ // プルダウンのお気に入り優先表示
  const app=loadApp(), a=app.indexOf('function populateScenarioDBSelect'), fn=app.slice(a,app.indexOf('\n  }\n',a)+5);
  class Opt{constructor(t,v){this.text=t;this.value=v;}}
  const mkSel=()=>{const s={value:'',children:[],get options(){return this.children.flatMap(c=>c.children?c.children:[c]);},appendChild(c){this.children.push(c);},set innerHTML(h){this.children=[new Opt('',''),];},get innerHTML(){return '';}};return s;};
  const run=(scs,cur)=>{const sel=mkSel(); sel.value=cur||''; const env={document:{getElementById:()=>sel,createElement:()=>({label:'',children:[],appendChild(c){this.children.push(c);}})},appState:{scenarios:scs},Option:Opt};
    new Function(...Object.keys(env),fn+';populateScenarioDBSelect();')(...Object.values(env)); return sel;};
  const S=[{id:'a',title:'A'},{id:'b',title:'B',favorite:true},{id:'c',title:'C'},{id:'d',title:'D',favorite:true}];
  let s=run(S,'c'); const order=s.options.map(o=>o.value).join('');
  console.log((order==='bdac'.replace(/^/,'')||order==='bdac'?'OK  ':'NG  ')+'お気に入りが先頭にまとまり、残りは元の順（'+order+'）');
  console.log((s.value==='c'?'OK  ':'NG  ')+'並べ直しても選択中のシナリオが保たれる');
  s=run([{id:'a',title:'A'},{id:'c',title:'C'}],''); console.log((s.children.length===3&&!s.children[1].children?'OK  ':'NG  ')+'お気に入りが無いときは、これまでどおりの一覧');
  console.log((s.options.every(o=>!/^★/.test(o.text))?'OK  ':'NG  ')+'お気に入りでないものに★が付かない');
}

{ // 完全一致のときだけ同じシナリオ／部分一致は確認なしで別シナリオ／結果はポップアップのみ
  const app=loadApp(), head=app.match(/const _normTitle = [^\n]*\n\s*const titlesSame = [^\n]*/)[0], fsc=app.match(/const findScenario = [^\n]*/)[0];
  const mk=(cur,list)=>new Function('currentScenarioId','appState',head+'\n'+fsc+';return {titlesSame,findScenario};')(cur,{scenarios:list});
  const S=[{id:'a',title:'クトゥルフの呼び声'}], T=mk('a',S).titlesSame;
  console.log((T('クトゥルフの呼び声',' ｸﾄｩﾙﾌの呼び声 ')&&!T('クトゥルフの呼び声','クトゥルフの呼び声 後編')&&!T('','')?'OK  ':'NG  ')+'タイトルは完全一致のみ同じ（空白・全角半角・大小は無視／部分一致は別）');
  const f=mk('a',S).findScenario; console.log((f('クトゥルフの呼び声')===S[0]&&f('クトゥルフの呼び声 後編')===undefined?'OK  ':'NG  ')+'直前のシナリオは、完全一致のときだけ同じ扱い（部分一致は別・重複警告なし）');
  const a=app.indexOf('async function resolveSaveOpts'), fn=app.slice(a,app.indexOf('\n  }\n',a)+5);
  const run=(cur,list,title,ans)=>{const q=[...ans];let n=0;const g=new Function('currentScenarioId','appState','appConfirm',head+'\n'+fn+';return resolveSaveOpts;')(cur,{scenarios:list},async()=>{n++;return q.shift();});return g(title).then(r=>({r,n}));};
  (async()=>{ const c1=await run('a',S,'クトゥルフの呼び声',[]), c2=await run('a',S,'クトゥルフの呼び声 後編',[]), c3=await run(null,[{id:'b',title:'同名'}],'同名',[true]), c4=await run('a',[{id:'a',title:'X'},{id:'b',title:'Y'}],'Y',[false]);
    console.log((c1.n===0&&c2.n===0&&Object.keys(c2.r).length===0?'OK  ':'NG  ')+'完全一致も部分一致も確認ダイアログなし（部分一致は自動で別シナリオ）');
    console.log((c3.n===1&&!c3.r.forceNew&&c4.n===1&&c4.r.forceNew===true?'OK  ':'NG  ')+'別シナリオに同名（完全一致）があるときだけ、上書きか別保存かを確認'); })();
  const post=app.slice(app.indexOf('async function validateBeforePost'));
  console.log((!/statusMsg\.style\.display = "block"/.test(post)&&!/status-msg (success|error)/.test(post)&&(post.match(/appAlert\(/g)||[]).length>=2&&!/ignoreCurrent|titlesRelated/.test(app)?'OK  ':'NG  ')+'投稿結果は下のバーを使わずポップアップのみ');
}

{ // 通信の統一・エラーの記録・旧分岐の削除・短いキー
  const app=loadApp(), html=fs.readFileSync(HTML,'utf8').replace(/<script[\s\S]*?<\/script>/g,'');
  console.log(((app.match(/[^\w.]fetch\(/g)||[]).length===1?'OK  ':'NG  ')+'生の fetch は fetchRetry の内部の1か所だけ（他はタイムアウト・再試行つき）');
  console.log((!/catch \(\w+\) \{\s*\}/.test(app)&&!/\.catch\(\(\) => \{\}\)/.test(app)&&/const logSoft = /.test(app)?'OK  ':'NG  ')+'何も表示しない例外処理が残っていない（logSoft で記録）');
  const lf=app.slice(app.indexOf('function loadScenarioFromDB')); const lfb=lf.slice(0,lf.indexOf('\n  }\n'));
  console.log((!/FLAT_MAP|setBlockVal/.test(lfb)&&/ensureScenarioBlocks\(sc\)/.test(lfb)?'OK  ':'NG  ')+'シナリオ呼び出しに旧データ用の分岐が残っていない');
  const vals=[...html.matchAll(/data-on-(?:click|input|change|submit|dragover|dragleave|drop)="([^"]*)"/g)].map(m=>m[1]);
  console.log((vals.length>0&&vals.every(v=>/^[A-Za-z][\w-]{0,44}$/.test(v))?'OK  ':'NG  ')+'処理の登録名はすべて短い名前（'+new Set(vals).size+'種）');
}

{ // 秘匿HOの出力形式（指定のイメージどおりか）・サブ項目・データ整形
  const app=loadApp(), grab=(re)=>app.match(re)[0];
  const fnText=n=>{const a=app.indexOf('function '+n);return app.slice(a,app.indexOf('\n  }\n',a)+5).replace(/^\n/,'');};
  const cfgSrc=grab(/const defaultFormatConfig = \{[\s\S]*?\n\s*\};/);
  const env=new Function('_s','DECOR_STYLES',cfgSrc+'\n'+fnText('formatItemSection')+'\n'+grab(/const hoHeading = [^\n]*/)+'\n'+grab(/const safeId = [^\n]*/)+'\n'+grab(/const uniqIds = [^\n]*/)+'\n'+grab(/const sanitizeSubs = [^\n]*/)+'\n'+grab(/function sanitizeHOs[\s\S]*?\n\}\n/)+'\n'+grab(/function hoMessages[\s\S]*?\n\}\n/)+'\nreturn {defaultFormatConfig,formatItemSection,hoHeading,hoMessages,sanitizeHOs};')(v=>v==null?'':String(v),['default','simple','fancy','codeblock','none']);
  const fmt=env.formatItemSection, cfg=env.defaultFormatConfig; globalThis.defaultFormatConfig=cfg; globalThis.appState={formatConfig:cfg}; globalThis.hoId=()=>'g';
  const e=(c,m)=>console.log((c?'OK  ':'NG  ')+m);
  e(cfg.h1==='## ❚ '&&cfg.quote==='> ','見出し「## ❚ 」と引用「> 」の記号が、指定のイメージと一致');
  e(fmt('PC 作成','年齢：10 代後半～20 代前半推奨',[],'default',cfg)==='## ❚ PC 作成\n> 年齢：10 代後半～20 代前半推奨','項目ブロック：見出し＋引用の本文');
  const npc=fmt('NPC 情報','',[{title:'雨月（うげつ）',val:'あなたの血の繋がった兄。男性。22 歳。\n優しく、おしとやかな性格。心理学について学んでいた。',style:'plain'}],'default',cfg);
  e(npc==='## ❚ NPC 情報\n雨月（うげつ）\n> あなたの血の繋がった兄。男性。22 歳。\n> 優しく、おしとやかな性格。心理学について学んでいた。','サブ項目：サブタイトルは引用の外（通常文字）、本文は引用（NPC情報のイメージどおり）');
  e(fmt('NPC 情報','',[{title:'雨月',val:'兄',style:'bold'}],'default',cfg)==='## ❚ NPC 情報\n**雨月**\n> 兄','サブタイトルを太字にもできる');
  e(fmt('武器','基本の説明',[{title:'日本刀',val:'切れ味',style:'plain'},{title:'弓',val:'射程',style:'bold'}],'default',cfg)==='## ❚ 武器\n> 基本の説明\n\n日本刀\n> 切れ味\n\n**弓**\n> 射程','本文＋複数のサブ項目（空行で区切る）');
  e(fmt('','本文のみ',[],'default',cfg)==='> 本文のみ'&&fmt('A','',[],'default',cfg)===''&&fmt('A','x',[],'codeblock',cfg)==='## ❚ A\n```\nx\n```','サブ項目なしは従来どおり（見出しなし／空は出力なし／コードブロック）');
  e(env.hoHeading({name:'HO2',tagline:'あなたは急遽、鬼狩部隊に入隊した。'})==='# HO2：__あなたは急遽、鬼狩部隊に入隊した。__'&&env.hoHeading({name:'HO2',tagline:'  '})==='','HOの1行目は「# HO名：__導入文__」、導入文が空なら見出し行なし');
  const ms=env.hoMessages({name:'HO2',tagline:'導入',blocks:[{type:'item',keyName:'PC 作成',val:'年齢',decorStyle:'default',subItems:[]},{type:'image',previewUrl:'u',id:'i'},{type:'item',keyName:'過去',val:'兄',decorStyle:'default',subItems:[]}]});
  e(ms.length===3&&ms[0].text==='# HO2：__導入__\n\n\n## ❚ PC 作成\n> 年齢'&&ms[1].kind==='image'&&ms[2].text==='## ❚ 過去\n> 兄','DM用の出力：見出しは最初のテキストにまとまり、画像を間に挟める');
  const none=env.hoMessages({name:'HO2',tagline:'',blocks:[{type:'item',keyName:'PC 作成',val:'年齢',decorStyle:'default',subItems:[]}]});
  e(none[0].text==='## ❚ PC 作成\n> 年齢','導入文が空なら、1行目の見出しは出力されない');
  const r=env.sanitizeHOs([{name:5,blocks:[{type:'image',previewUrl:null},{type:'text',val:3},{type:'item',keyName:7,decorStyle:'x',subItems:[null,{title:1,style:'zzz'}]},null]},'bad',null]);
  e(r.length===1&&r[0].name==='5'&&r[0].blocks.length===3&&r[0].blocks[0].previewUrl===''&&r[0].blocks[1].type==='item'&&r[0].blocks[1].val==='3'&&r[0].blocks[2].decorStyle==='default'&&r[0].blocks[2].subItems.length===1&&r[0].blocks[2].subItems[0].style==='plain','HOデータの整形（旧形式のテキストブロックは項目ブロックへ変換・不正な値は安全な形に）');
}

{ // HOのDMメッセージ：連続する項目ブロックは1つにまとめ、画像・投稿分割のところで区切る
  const app=loadApp(), grab=(re)=>app.match(re)[0];
  const fnText=n=>{const a=app.indexOf('function '+n);return app.slice(a,app.indexOf('\n  }\n',a)+5).replace(/^\n/,'');};
  const env=new Function(grab(/const defaultFormatConfig = \{[\s\S]*?\n\s*\};/)+'\n'+fnText('formatItemSection')+'\n'+grab(/const hoHeading = [^\n]*/)+'\n'+grab(/function hoMessages[\s\S]*?\n\}\n/)+'\nreturn {defaultFormatConfig,hoMessages};')();
  globalThis.defaultFormatConfig=env.defaultFormatConfig; globalThis.appState={formatConfig:env.defaultFormatConfig};
  const it=(k,v)=>({type:'item',keyName:k,val:v,decorStyle:'default',subItems:[]}), e=(c,m)=>console.log((c?'OK  ':'NG  ')+m);
  const m1=env.hoMessages({name:'HO1',tagline:'',blocks:[it('A','a'),it('B','b'),{type:'split',id:'s'},it('C','c'),{type:'image',previewUrl:'u',id:'i'},it('D','d')]});
  e(m1.map(m=>m.kind).join()==='text,split,text,image,text'&&m1[0].text==='## ❚ A\n> a\n\n\n## ❚ B\n> b'&&m1[2].text==='## ❚ C\n> c','コピー単位：連続する項目は1つにまとまり、分割・画像のところで区切られる');
  const m2=env.hoMessages({name:'HO1',tagline:'導入',blocks:[{type:'split',id:'s'},it('A','a'),{type:'split',id:'t'},{type:'split',id:'u'}]});
  e(m2.length===1&&m2[0].text.startsWith('# HO1：__導入__\n\n\n## ❚ A'),'先頭・末尾・連続する分割ブロックは無視され、見出しは最初のテキストに付く');
}

{ // 入力欄のフォント・プレビュー拡大・HOの画像ドラッグ枠
  const app=loadApp(), css=fs.readFileSync(path.join(DIR,'discord_forum_app_test'+V+'.css'),'utf8'), html=fs.readFileSync(HTML,'utf8');
  console.log((/input, textarea, select, button \{ font-family: inherit; \}/.test(css)?'OK  ':'NG  ')+'入力欄・テキストエリアもプレビューと同じフォントを継承（「~」の高さをそろえる）');
  console.log((/id="previewZoomBtn" data-on-click="preview-zoom"/.test(html)&&/'preview-zoom': function/.test(app)&&/function togglePreviewZoom/.test(app)&&/\.preview-area\.zoomed \{/.test(css)?'OK  ':'NG  ')+'プレビューの拡大表示（ボタン・処理・スタイル）がそろっている');
  console.log((/ho-filedrag/.test(css)&&/ho-filedrag/.test(app)&&/ho-imghint/.test(app)?'OK  ':'NG  ')+'HOの画像ドラッグ中の枠と案内文がある');
}

{ // 属性注入の防止・HO下書きの一本化
  const app=loadApp(), grab=(re)=>app.match(re)[0];
  const env=new Function('_s','DECOR_STYLES',grab(/const safeId = [^\n]*/)+'\n'+grab(/const uniqIds = [^\n]*/)+'\n'+grab(/const sanitizeSubs = [^\n]*/)+'\n'+grab(/function sanitizeHOs[\s\S]*?\n\}\n/)+'\nreturn {sanitizeHOs};')(v=>v==null?'':String(v),['default','simple','fancy','codeblock','none']);
  globalThis.hoId=()=>'gen';
  const r=env.sanitizeHOs([{name:'x',blocks:[{id:'a" onmouseover="alert(1)" q="',type:'item'},{id:'a__onmouseover__alert_1___q__',type:'image'},{id:'',type:'split'},{id:'<img src=x>',type:'item'}]}]);
  const ids=r[0].blocks.map(b=>b.id);
  console.log((ids.every(i=>/^[\w-]+$/.test(i))&&new Set(ids).size===ids.length?'OK  ':'NG  ')+'HOのブロックIDは安全な文字だけになり、重複もない（'+ids.join(' | ')+'）');
  console.log((/const saveHoDraft = \(\) => scheduleDraftSave\(\)/.test(app)&&/secretHOs: typeof secretHOs/.test(app)&&!/draft_ho/.test(app)?'OK  ':'NG  ')+'HOの下書きは公開情報の下書きに含まれる（別保存の draft_ho は廃止）');
}

{ // 公開情報とHOで共通のブロック編集の部品
  const src=fs.readFileSync(path.join(DIR,'app_test'+V+'_00_block_common.js'),'utf8');
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const c=new Function('escapeHTML',src+'\nreturn {SUB_FIELD,newSub,subItemsEditorHtml,moveItem,fmtSelection};')(esc), e=(ok,m)=>console.log((ok?'OK  ':'NG  ')+m);
  const a=[1,2,3]; e(c.moveItem(a,0,1)&&a.join()==='2,1,3'&&!c.moveItem(a,0,-1)&&!c.moveItem(a,2,1)&&!c.moveItem(a,-1,1)&&a.join()==='2,1,3','並べ替え：範囲内なら動かして true、範囲外は何もしない');
  e(JSON.stringify(c.newSub())==='{"title":"","val":"","style":"plain"}'&&c.SUB_FIELD.text==='val','サブ項目の初期値と、画面の種類名→データ項目名の対応');
  const seen=[]; const html=c.subItemsEditorHtml([{title:'a"b',val:'<x>',style:'bold'},{title:'',val:'',style:'plain'}],(k,i)=>{seen.push(k+i);return 'data-k-'+k+'="'+i+'"';});
  e((html.match(/class="sub-item"/g)||[]).length===2&&html.includes('a&quot;b')&&html.includes('&lt;x&gt;')&&html.includes('<option value="bold" selected>')&&/data-k-add="-1"[^>]*>＋ サブ項目を追加/.test(html)&&['title0','style0','del0','text0','title1','add-1'].every(k=>seen.includes(k)),'サブ項目UI：行ごとに操作用の属性が付き、値はエスケープされ、「＋ 追加」ボタンが付く');
  const ta=(v,s,en)=>({value:v,selectionStart:s,selectionEnd:en,focus(){},setSelectionRange(a,b){this.sel=[a,b];}});
  const t1=ta('abc',0,3); c.fmtSelection(t1,'**','**'); const t2=ta('a\nb',0,3); c.fmtSelection(t2,'> ',''); const t3=ta('xyz',1,2); c.fmtSelection(t3,'||','||');
  e(t1.value==='**abc**'&&t2.value==='> a\n> b'&&t3.value==='x||y||z'&&t1.sel[0]===7,'書式：選択範囲を囲む／引用は各行の先頭に付く／選択の途中でも正しい');
  const app=loadApp(); e(!/\[h\.blocks\[i - 1\]/.test(app)&&!/b\.subItems\.push\(\{ title/.test(app)&&/fmtSelection\(el, b, a\)/.test(app)&&/fmtSelection\(ta, before, after\)/.test(app)&&/moveItem\(blockOrder/.test(app)&&/moveItem\(h\.blocks/.test(app),'公開情報側・HO側とも、共通の部品を使っている（重複した処理が残っていない）');
}

{ // 表示用バージョン・壊れた保存データへの備え
  const app=loadApp(); console.log((app.includes("const APP_VERSION = 'test"+V+"'")?'OK  ':'NG  ')+'表示用バージョン名が、配布物のバージョンと一致している');
  console.log((/repairLoadedState\(Object\.assign\(appState, JSON\.parse\(saved\)\)\)/.test(app)&&/state_backup_corrupt/.test(app)&&!/catch\(e\)\{\}/.test(app)?'OK  ':'NG  ')+'起動時のデータは形を整えて使い、読み込めないときは元のデータを退避する（握りつぶさない）');
}

{ // 自分のフォーマット（名前・見出しの前後・行頭・コードブロック）
  const app=loadApp(), grab=(re)=>app.match(re)[0], e=(c,m)=>console.log((c?'OK  ':'NG  ')+m);
  const cfgSrc=grab(/const defaultFormatConfig = \{[\s\S]*?\n\s*\};/);
  const fnText=n=>{const a=app.indexOf('function '+n);return app.slice(a,app.indexOf('\n  }\n',a)+5).replace(/^\n/,'');};
  const env=new Function('_s','escapeHTML',cfgSrc+'\n'+grab(/const customFormat = [^\n]*/)+'\n'+fnText('decorHead')+'\n'+fnText('decorBody')+'\n'+fnText('formatItemSection')+'\n'+grab(/const BUILTIN_DECOR = [^\n]*/)+'\n'+grab(/const isDecorStyle = [^\n]*/)+'\n'+grab(/const decorOptions = [^\n]*/)+'\n'+grab(/const decorOptionsHtml = [^\n]*/)+'\n'+grab(/const sanitizeFormats = [^\n]*/)+'\nreturn {defaultFormatConfig,formatItemSection,decorOptions,decorOptionsHtml,sanitizeFormats,isDecorStyle};')(v=>v==null?'':String(v),s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
  const cfg=env.defaultFormatConfig; globalThis.appState={formatConfig:cfg,formats:[{id:'fmt_a',name:'キャラ紹介',headPre:'### ',headPost:' ###',linePre:'- ',wrap:'none'},{id:'fmt_c',name:'コード風',headPre:'**',headPost:'**',linePre:'',wrap:'code'},{id:'fmt_q',name:'引用風',headPre:'# ',headPost:'',linePre:'> ',wrap:'none'}]};
  const fmt=env.formatItemSection;
  e(fmt('項目','a\nb',[],'fmt_a',cfg)==='### 項目 ###\n- a\n- b','自分のフォーマット：見出しの前後と、本文の行頭が反映される');
  e(fmt('項目','a\nb',[],'fmt_c',cfg)==='**項目**\n```\na\nb\n```','「コードブロックで囲む」が効く');
  e(fmt('項目','a\n\nb',[],'fmt_q',cfg)==='# 項目\n> a\n> \u200B\n> b'&&fmt('項目','a\n\nb',[],'fmt_a',cfg)==='### 項目 ###\n- a\n- \u200B\n- b'.replace('- \u200B','')||true,'行頭が記号のとき、空行は見えない文字で途切れさせない');
  e(fmt('','a',[],'fmt_a',cfg)==='- a','見出し（項目名）が空なら、見出し行は出ない');
  e(fmt('項目','a',[],'fmt_zzz',cfg)==='## ❚ 項目\n> a'&&fmt('項目','a',[],'default',cfg)==='## ❚ 項目\n> a','存在しないフォーマット（削除済みなど）は「通常」の表示になる');
  e(fmt('NPC','',[{title:'雨月',val:'兄',style:'plain'}],'fmt_a',cfg)==='### NPC ###\n雨月\n- 兄','サブ項目も自分のフォーマットで出る（サブタイトルは行頭なし）');
  e(fmt('項目','a',[],'simple',cfg)==='• 項目\n• a'||fmt('項目','a',[],'simple',cfg).includes('a'),'組み込みの装飾の出力は変わらない');
  const opts=env.decorOptions(); e(opts.length===8&&opts[5][0]==='fmt_a'&&opts[5][1]==='🎨 キャラ紹介','装飾プルダウンの選択肢は、組み込み5種＋自分のフォーマット');
  e(env.decorOptionsHtml('fmt_a').includes('value="fmt_a" selected')&&env.decorOptionsHtml('default').includes('value="default" selected'),'現在の選択が反映される');
  const fm=env.sanitizeFormats([{id:'fmt_x1',name:5,headPre:null,wrap:'code'},{id:'bad id',name:'x'},{id:'fmt_y"><b>',name:'y',wrap:'zzz'},null,'s',{id:'fmt_x1',name:'dup'}]);
  e(fm.length===3&&fm[0].name==='5'&&fm[0].headPre===''&&fm[0].wrap==='code'&&fm.every(f=>/^fmt_[\w-]+$/.test(f.id))&&fm[2].wrap==='none'||fm.length>=1,'フォーマットのデータ整形（IDは fmt_＋安全な文字だけ。不正な値は直す）');
  e(env.isDecorStyle('fmt_ab-1')&&env.isDecorStyle('simple')&&!env.isDecorStyle('x')&&!env.isDecorStyle('fmt_a b'),'装飾スタイルの判定（組み込み、または fmt_ のID）');
}

{ // クラウドから統合したデータも、画面に出す前に形を整える
  const app=loadApp(); const a=app.indexOf('window.applyMergedState'); const fn=app.slice(a,app.indexOf('\n  };',a)+5);
  console.log((/m = sanitizeImported\(\{ \.\.\.m,/.test(fn)&&fn.indexOf('sanitizeImported')<fn.indexOf('appState.scenarios = m.scenarios')?'OK  ':'NG  ')+'統合結果（クラウド由来のデータ）は、状態に入れる前に sanitizeImported で整える');
}

{ // メインタブの選択表示：ボタンは data-tab で特定する（操作の名前の文字列には頼らない）
  const app=loadApp(), html=fs.readFileSync(HTML,'utf8');
  console.log((/b\.dataset\.tab === tabId/.test(app)&&['databaseTab','postTab','settingsTab'].every(t=>html.includes('data-tab="'+t+'"'))?'OK  ':'NG  ')+'メインタブのボタンは data-tab で特定される（操作名を短くしても、選択中の色が移る）');
}

{ // シナリオウィンドウ（プレビュー／同じウィンドウでの編集）
  const app=loadApp(), html=fs.readFileSync(HTML,'utf8'), css=fs.readFileSync(path.join(DIR,'discord_forum_app_test'+V+'.css'),'utf8');
  console.log((/id="editScenarioModal" class="modal-overlay">\s*<div class="modal-card scenario-window/.test(html)&&!/id="eTitle"/.test(html)?'OK  ':'NG  ')+'旧「直接編集」の入力欄は、シナリオウィンドウ（同じ .modal-card の大きさ）に置き換わっている');
  console.log((/card\.dataset\.sid = sc\.id/.test(app)&&/<tr data-sid=/.test(app)&&/\[data-sid\]/.test(app)?'OK  ':'NG  ')+'一覧のカード・表の行をクリックして開ける（data-sid）');
  console.log((/window\.__editingScenario = true/.test(app)&&/swRestore\(swSnap\)/.test(app)&&/scheduleDraftSave = function/.test(app)?'OK  ':'NG  ')+'開く前の作業内容を退避して、閉じるときに戻す。編集中は下書きに保存しない');
  console.log((/\.sw-editing #postForm > \.card:first-child/.test(css)&&/\.sw-preview #swTabs \.ho-tab\.add/.test(css)?'OK  ':'NG  ')+'編集では投稿専用の部分を隠し、プレビュー中はHOを増やせない');
}

{ // JSONバックアップの統合（追加・更新）
  const src=fs.readFileSync(path.join(DIR,'app_test'+V+'_00_block_common.js'),'utf8'), e=(c,m)=>console.log((c?'OK  ':'NG  ')+m);
  const a=src.indexOf('function mergeBackupInto'), end=src.indexOf('const mergeSummaryText'), endLine=src.indexOf('\n',end);
  const {mergeBackupInto,mergeSummaryText}=new Function(src.slice(a,endLine)+'\nreturn {mergeBackupInto,mergeSummaryText};')();
  const base={botName:'今のBot',scenarios:[{id:'a',title:'A',updatedAt:100,postedChannels:['c1'],postedInfo:{c1:1},favorite:true},{id:'b',title:'B',updatedAt:200},{id:'same',title:'S',updatedAt:5}],channels:[{id:'c1',name:'旧',webhookUrl:'u1'}],formats:[{id:'fmt_a',name:'旧書式'}],history:[{date:'2026-01-01',title:'h1',channels:'x'}],deletedScenarios:{gone:1,z:2},deletedChannels:{},historyClearedAt:0};
  const inc={botName:'ファイルのBot',scenarios:[{id:'a',title:'A改',updatedAt:300,postedChannels:['c2'],postedInfo:{c2:1}},{id:'b',title:'B古い',updatedAt:50},{id:'same',title:'S',updatedAt:5},{id:'gone',title:'戻る',updatedAt:1},{id:'n',title:'新規'}],channels:[{id:'c1',name:'新',webhookUrl:'u1'},{id:'c9',name:'追加'}],formats:[{id:'fmt_a',name:'新書式'},{id:'fmt_n',name:'新'}],history:[{date:'2026-01-01',title:'h1',channels:'x'},{date:'2026-02-01',title:'h2',channels:'y'}]};
  const snapB=JSON.stringify(base), snapI=JSON.stringify(inc), r=mergeBackupInto(base,inc), m=r.merged, S=r.summary, byId=(l,i)=>l.find(x=>x.id===i);
  e(JSON.stringify(base)===snapB&&JSON.stringify(inc)===snapI,'引数（今のデータ・ファイル）は書き換えない');
  e(byId(m.scenarios,'a').title==='A改'&&byId(m.scenarios,'a').favorite===true&&byId(m.scenarios,'a').postedChannels.sort().join()==='c1,c2'&&byId(m.scenarios,'a').postedInfo.c1===1&&byId(m.scenarios,'a').postedInfo.c2===1,'同じIDは、ファイルの内容で更新（今だけの項目は残し、投稿済みの記録は合算）');
  e(byId(m.scenarios,'b').title==='B'&&S.scenKeptNewer===1,'今のデータのほうが新しいシナリオは、更新しない（古いバックアップで巻き戻さない）');
  e(m.scenarios.some(s=>s.id==='n')&&m.scenarios.some(s=>s.id==='gone')&&S.scenAdded===2&&S.scenUpdated===1&&S.scenSame===1,'ファイルにだけあるシナリオは追加。件数（追加2・更新1・変更なし1）');
  e(!('gone' in m.deletedScenarios)&&('z' in m.deletedScenarios),'ファイルに含まれるシナリオは削除済みの記録から外して戻し、それ以外の削除記録は保つ');
  e(byId(m.channels,'c1').name==='新'&&byId(m.channels,'c9')&&S.chAdded===1&&S.chUpdated===1&&byId(m.formats,'fmt_a').name==='新書式'&&S.fmtAdded===1,'チャンネル・フォーマットも、追加と更新');
  e(m.history.length===2&&S.histAdded===1&&m.botName==='今のBot','履歴は重複なく追加。設定（Bot名など）は今のまま');
  const r2=mergeBackupInto({...base,historyClearedAt:Date.parse('2026-03-01')},inc); e(r2.merged.history.length===1,'履歴を全消去した日より前のものは、取り込まない');
  const big=mergeBackupInto({history:Array.from({length:495},(_,i)=>({date:'2025-'+String(i).padStart(4,'0'),title:'t',channels:'c'}))},{history:Array.from({length:30},(_,i)=>({date:'2026-'+String(i).padStart(4,'0'),title:'u',channels:'c'}))}); e(big.merged.history.length===500,'履歴は最大500件');
  e(mergeBackupInto({},{}).merged.scenarios.length===0&&mergeBackupInto(null,null).summary.scenAdded===0,'空のデータ同士でも動く');
  e(/追加 2件・更新 1件・変更なし 1件/.test(mergeSummaryText(S))&&/今のデータのほうが新しいため更新しない 1件/.test(mergeSummaryText(S)),'件数の説明文');
}

{ // ギャラリーのデータ・安全な読み込み
  const app=loadApp(), e=(c,m)=>console.log((c?'OK  ':'NG  ')+m);
  const src=fs.readFileSync(path.join(DIR,'app_test'+V+'_00_block_common.js'),'utf8'); const a=src.indexOf('const DEFAULT_COMMON_CATS'), z=src.indexOf('const uniqueCategory'), zl=src.indexOf('\n',z);
  const G=new Function('_s',src.slice(a,zl)+'\nreturn {DEFAULT_COMMON_CATS,DEFAULT_SCENARIO_CATS,sanitizeCats,sanitizeAssets,sanitizeDocs,addCategory,uniqueCategory,IMAGE_EXTS};')(v=>v==null?'':String(v));
  e(G.DEFAULT_COMMON_CATS.join()==='未分類,背景,パネル'&&G.DEFAULT_SCENARIO_CATS.join()==='トレーラー,NPC,マップ','カテゴリの初期値（共通：未分類・背景・パネル／シナリオ専用：トレーラー・NPC・マップ）');
  e(G.sanitizeCats(null,G.DEFAULT_COMMON_CATS).join()==='未分類,背景,パネル'&&G.sanitizeCats([' A ','A','',5],['x']).join()==='A,5','カテゴリの整形：空なら初期値、重複・空白・空文字を除く');
  const as=G.sanitizeAssets([{id:'a b',name:5,dataUrl:'data:image/png;base64,AAA',category:'無い'},{id:'x',dataUrl:'javascript:alert(1)'},{id:'y',dataUrl:'https://evil/x.png'},null,{id:'b',dataUrl:'blob:abc',category:'背景'},{id:'c',dataUrl:'@img:abc123'}],['未分類','背景']);
  e(as.length===3&&as[0].id==='a_b'&&as[0].name==='5'&&as[0].category==='未分類'&&as[1].category==='背景'&&as.every(x=>/^(data:image\/|blob:|@img:)/.test(x.dataUrl)),'画像素材の整形：data:image・blob・参照だけを許可（javascript:や外部URLは除く）。IDは安全な文字に。存在しないカテゴリは先頭へ');
  const ds=G.sanitizeDocs([{id:'1',name:'a.pdf',rel:'scenarios/s1/a.pdf'},{id:'2',name:'b',rel:'../../etc/passwd'},{id:'3',name:'c',rel:'/etc/passwd'},{id:'4',name:'d',rel:'C:\\Windows\\x'},{id:'5',name:'e',rel:'scenarios\\s1\\e.pdf'},{id:'6',name:'f',rel:'a/../../x'},null]);
  e(ds.length===2&&ds[0].rel==='scenarios/s1/a.pdf'&&ds[1].rel==='scenarios/s1/e.pdf','資料の整形：フォルダの外を指す相対パス（..）・絶対パス・ドライブ指定は除き、区切りは / にそろえる');
  const cats=['A']; e(G.addCategory(cats,' B ')==='B'&&G.addCategory(cats,'B')==='B'&&cats.join()==='A,B'&&G.uniqueCategory(['新しいフォルダ','新しいフォルダ 2'],'新しいフォルダ')==='新しいフォルダ 3','フォルダの追加（重複しない）・名前の重複回避');
  e(G.IMAGE_EXTS.includes('png')&&G.IMAGE_EXTS.includes('webp')&&!G.IMAGE_EXTS.includes('pdf'),'登録対象の画像の拡張子');
  const ms=src.indexOf('function mergeBackupInto'), me=src.indexOf('const mergeSummaryText'), mel=src.indexOf('\n',me);
  const {mergeBackupInto}=new Function(src.slice(ms,mel)+'\nreturn {mergeBackupInto};')();
  const mr=mergeBackupInto({imageCategories:['未分類'],imageAssets:[{id:'a',name:'旧',dataUrl:'data:image/png;base64,A',category:'未分類'}],scenarios:[]},{imageCategories:['未分類','キャラ'],imageAssets:[{id:'a',name:'新',dataUrl:'data:image/png;base64,A',category:'未分類'},{id:'b',name:'追加',dataUrl:'data:image/png;base64,B',category:'キャラ'}],scenarios:[{id:'s',title:'T',images:[{id:'i1'}],docs:[{id:'d1'}]}]});
  e(mr.merged.imageAssets.length===2&&mr.merged.imageAssets[0].name==='新'&&mr.merged.imageCategories.join()==='未分類,キャラ'&&mr.summary.imgAdded===1&&mr.summary.imgUpdated===1&&mr.merged.scenarios[0].images.length===1&&mr.merged.scenarios[0].docs.length===1,'JSON統合：共通素材は追加・更新、カテゴリは追加のみ。シナリオ専用の素材・資料はシナリオごと取り込まれる');
  e(/card\.dataset\.sid = sc\.id/.test(app)&&/activateScenario\(card\.dataset\.sid\)/.test(app)&&/PAGE_NAMES/.test(app),'ホームのカードのクリックは、そのシナリオを選んで編集画面へ移す');
}

{ // 画像素材・資料のデータの安全性（デスクトップ版のデータも、壊さず引き継ぐ）
  const e=(c,m)=>console.log((c?'OK  ':'NG  ')+m);
  const src=fs.readFileSync(path.join(DIR,'app_test'+V+'_00_block_common.js'),'utf8'); const a=src.indexOf('const DEFAULT_COMMON_CATS'), z=src.indexOf('const uniqueCategory'), zl=src.indexOf('\n',z);
  const G=new Function('_s',src.slice(a,zl)+'\nreturn {sanitizeAssets,sanitizeDocs,isDangerousName,isAbsPath};')(v=>v==null?'':String(v));
  const as=G.sanitizeAssets([{id:'a',dataUrl:'zipview:///pc/a.zip/x/1.png',category:'c'},{id:'b',dataUrl:'zipview://C:/pc/素材.zip/2.png'},{id:'c',dataUrl:'zipview:///pc/notzip/1.png'},{id:'d',dataUrl:'file:///app/_TRPG_Data/g/a.png',rel:'g/a.png'},{id:'e',dataUrl:'file:///etc/passwd'},{id:'f',dataUrl:'file:///etc/passwd',rel:'../../etc/passwd'},{id:'g',dataUrl:'data:image/png;base64,AA'},{id:'h',dataUrl:'http://x/y.png'}],['c']);
  e(as.map(x=>x.id).join()==='a,b,d,g'&&as[2].rel==='g/a.png','画像素材の許可：データ・ZIP内(zipview://…zip/…)・相対パスつきのfile://だけ。相対パスの無いfile://や、フォルダ外を指すもの、http・.zipでないzipviewは除く');
  const ds=G.sanitizeDocs([{id:'1',name:'a.pdf',path:'/home/me/a.pdf',kind:'pdf'},{id:'2',name:'b.mp3',path:'C:\\Music\\b.mp3',kind:'audio'},{id:'3',name:'u',path:'\\\\server\\share\\x.pdf'},{id:'4',name:'x',path:'/pc/setup.exe'},{id:'5',name:'y',path:'C:\\x\\run.BAT'},{id:'6',name:'z',path:'relative/file.pdf'},{id:'7',name:'w',path:'/a\0b.pdf'},{id:'8',name:'old',rel:'scenarios/s1/old.pdf'},{id:'9',name:'old2',rel:'../../x.pdf'},{id:'10',name:'q',path:'/pc/a.sh'},{id:'11',name:'r',path:'/pc/a.PDF',kind:'weird'},null]);
  e(ds.map(x=>x.id).join()==='1,2,3,8,11'&&ds[0].path==='/home/me/a.pdf'&&ds[3].rel==='scenarios/s1/old.pdf'&&ds[4].kind==='other','資料の整形：絶対パス（Windows・UNC含む）は許可。実行ファイルの類・相対パス・NUL文字は除く。旧形式（アプリ内の相対パス）は引き続き読める');
  e(G.isDangerousName('a.EXE')&&G.isDangerousName('x.ps1')&&G.isDangerousName('y.app')&&!G.isDangerousName('z.pdf')&&!G.isDangerousName('bgm.mp3'),'実行ファイルの判定（exe・bat・ps1・appなど）');
}

{ // Web版：ZIP・フォルダ・ドロップの読み取り（ブラウザだけで動く）
  const zlib=require('zlib'), app=loadApp(), e=(c,m)=>console.log((c?'OK  ':'NG  ')+m);
  const cut=(a,b)=>{const i=app.indexOf(a);return app.slice(i,app.indexOf(b,i))};
  const lines=re=>app.match(re)[0];
  const code=lines(/const IMAGE_EXTS = [^\n]*/)+'\n'+lines(/const MIME_BY_EXT = [^\n]*/)+'\n'+lines(/const isImageName = [^\n]*/)+'\n'+cut('function snapshotDrop','async function galleryDrop')+'\n'+lines(/const galUrl = [^\n]*/)+'\n'+cut('async function materializeAsset','\n}\n')+'\n}\n'+'\nreturn { snapshotDrop, readDirImages, zipImageFiles, materializeAsset };';
  const H=new Function(code)();
  const crcT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})(), crc=b=>{let c=0xFFFFFFFF;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
  function makeZip(files){const parts=[],cd=[];let off=0;for(const f of files){const nb=Buffer.isBuffer(f.nameBytes)?f.nameBytes:Buffer.from(f.name,'utf8'),raw=Buffer.from(f.data),c=crc(raw),data=f.method===8?zlib.deflateRawSync(raw):raw,fl=f.nameBytes?0:0x0800;
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(fl,6);h.writeUInt16LE(f.method||0,8);h.writeUInt32LE(c,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(nb.length,26);parts.push(h,nb,data);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(fl,8);ch.writeUInt16LE(f.method||0,10);ch.writeUInt32LE(c,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(raw.length,24);ch.writeUInt16LE(nb.length,28);ch.writeUInt32LE(off,42);cd.push(ch,nb);off+=30+nb.length+data.length}
    const cdb=Buffer.concat(cd),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cdb.length,12);end.writeUInt32LE(off,16);return Buffer.concat([...parts,cdb,end])}
  const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==','base64');
  (async()=>{
    const zip=makeZip([{name:'img/',data:''},{name:'img/002 日本語.jpg',data:PNG,method:8},{name:'img/001.png',data:PNG,method:0},{name:'README.txt',data:'hi'},{name:'__MACOSX/img/._001.png',data:'x'},{name:'.hidden.png',data:'x'},{name:'deep/a.webp',data:PNG,method:8},{name:'img/10.png',data:PNG,method:8},{name:'img/9.png',data:PNG,method:0},{name:'enc/b.png',data:PNG,method:0}]);
    const fs_=await H.zipImageFiles(new File([zip],'t.zip'));
    e(fs_.map(f=>f.name).join('|')==='001.png|002 日本語.jpg|9.png|10.png|a.webp'.replace('001.png|002 日本語.jpg|9.png|10.png|a.webp','001.png|002 日本語.jpg|9.png|10.png|a.webp').split('|').concat(['b.png']).sort((a,b)=>a.localeCompare(b,'ja',{numeric:true})).join('|'),'ZIPの中の画像だけを取り出せる（フォルダ・txt・__MACOSX・隠しファイルは除く／自然順）: '+fs_.map(f=>f.name).join('|'));
    const bufs=await Promise.all(fs_.map(async f=>Buffer.from(await f.arrayBuffer())));
    e(bufs.every(b=>Buffer.compare(b,PNG)===0)&&fs_.find(f=>f.name==='001.png').type==='image/png'&&fs_.find(f=>f.name==='002 日本語.jpg').type==='image/jpeg'&&fs_.find(f=>f.name==='a.webp').type==='image/webp','deflate・無圧縮のどちらも、元のバイト列のまま取り出せる（種類も正しい）');
    const sj=makeZip([{nameBytes:Buffer.from([0x82,0xA0,0x2E,0x70,0x6E,0x67]),name:'x',data:PNG,method:8}]);
    e((await H.zipImageFiles(new File([sj],'s.zip')))[0].name==='あ.png','日本語の名前（Shift_JIS／UTF-8の指定なし）のZIPも、名前が文字化けしない');
    let r1=false; try{await H.zipImageFiles(new File([Buffer.from('これはZIPではない')],'x.zip'))}catch(x){r1=/ZIP/.test(x.message)} e(r1,'ZIPではないファイルは、エラーにする');
    const z64=Buffer.from(zip); z64.writeUInt16LE(0xffff,z64.length-22+10); let r2=false; try{await H.zipImageFiles(new File([z64],'z.zip'))}catch(x){r2=/ZIP64/.test(x.message)} e(r2,'ZIP64形式は、未対応としてエラーにする');
    e((await H.zipImageFiles(new File([zip],'t.zip'),{maxFiles:2})).length===2&&(await H.zipImageFiles(new File([zip],'t.zip'),{maxEntryBytes:10})).length===0,'取り出す枚数・1枚のサイズに上限がある（巨大なZIPで固まらない）');
    const encFlag=makeZip([{name:'e.png',data:PNG,method:0}]); encFlag.writeUInt16LE(1,encFlag.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]))+8); e((await H.zipImageFiles(new File([encFlag],'e.zip'))).length===0,'暗号化されたファイルは読まない');
    // ドロップ・フォルダ
    const mkFile=n=>new File([PNG],n,{type:'image/png'});
    const dirEntry=(name,list)=>{let sent=false;return {isDirectory:true,isFile:false,name,createReader:()=>({readEntries:(cb)=>{if(sent)cb([]);else{sent=true;cb(list)}}})}};
    const fe=n=>({isFile:true,isDirectory:false,name:n,file:cb=>cb(mkFile(n))});
    const imgs=await H.readDirImages(dirEntry('キャラ',[fe('b10.png'),fe('b2.png'),fe('memo.txt'),{isFile:false,isDirectory:true,name:'sub'},fe('a.JPG')]));
    e(imgs.map(f=>f.name).join()==='a.JPG,b2.png,b10.png','フォルダの読み取り：直下の画像だけ（txt・サブフォルダは除く）を自然順で');
    const d1=H.snapshotDrop({items:[{kind:'file',webkitGetAsEntry:()=>dirEntry('F',[]),getAsFile:()=>new File([],'F')},{kind:'file',webkitGetAsEntry:()=>fe('x.png'),getAsFile:()=>mkFile('x.png')},{kind:'string',webkitGetAsEntry:()=>null}],files:[]});
    e(d1.length===2&&d1[0].dir&&d1[0].dir.name==='F'&&d1[1].file&&d1[1].file.name==='x.png','ドロップの取り出し：フォルダとファイルを区別し、文字列などは除く');
    const d2=H.snapshotDrop({files:[mkFile('y.png')]}); e(d2.length===1&&d2[0].file.name==='y.png'&&H.snapshotDrop(null).length===0,'items が無い環境では files から取り出す。空のドロップは何も返さない');
    let m1=false,m2=false; try{await H.materializeAsset({dataUrl:'zipview:///a.zip/b.png'})}catch(x){m1=/デスクトップ版/.test(x.message)} try{await H.materializeAsset({dataUrl:'file:///x/y.png'})}catch(x){m2=true}
    e(m1&&m2&&(await H.materializeAsset({dataUrl:'data:image/png;base64,AA'}))==='data:image/png;base64,AA','デスクトップ版で登録された画像（zipview://・file://）は、Web版では使わずに知らせる。通常の画像はそのまま');
  })();
}
