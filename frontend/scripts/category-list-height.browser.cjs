// Offline Chromium layout regression: actual category component and all OWNER
// styles, isolated API fixtures only. NOT live OWNER proof; never writes DB.
// Run: node scripts/category-list-height.browser.cjs <artifact-directory> [--before]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const project = process.cwd();
const output = process.argv[2];
const before = process.argv.includes('--before');
if (!output || !fs.statSync(output).isDirectory()) throw new Error('Existing artifact directory required');
const main = fs.readFileSync(path.join(project, 'src/main.jsx'), 'utf8');
const css = [fs.readFileSync(before ? path.join(output, 'category-height-v13-before.css') : path.join(project, 'src/styles/owner/raw-categories.css'), 'utf8'),
  ...[...main.matchAll(/import\s+["']([^"']+\.css)["']/g)].map(m => fs.readFileSync(path.resolve(project, 'src', m[1]), 'utf8'))]
  .join('\n').replace(/@import\s+url\(["']?https?:[^;]+;/g, '/* Offline fixture: remote font omitted. */');

async function bundle() {
  return (await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import CategoriesPage from './src/pages/CategoriesPage.jsx';
      const root = createRoot(document.getElementById('fixture'));
      let generation = 0;
      window.renderCategoryFixture = (type, active, archived, pending = false) => {
        window.fixtureRows = [...Array.from({length:active}, (_,i) => ({id:'a'+i, name:'Категория '+(i+1),slug:(type==='raw'?'raw':'dish')+'-'+i,sort_order:i,is_active:true})),
          ...Array.from({length:archived}, (_,i) => ({id:'b'+i,name:'Архив '+(i+1),slug:(type==='raw'?'raw':'dish')+'-arch-'+i,sort_order:i,is_active:false}))];
        window.fixturePending = pending;
        generation += 1;
        root.render(<div key={generation} className="dashboard-shell is-sidebar-expanded">
          <aside id="dashboardSidebar" className="dashboard-sidebar" />
          <div className="dashboard-main"><header className="dashboard-topbar"><div className="topbar-left">OWNER layout regression — isolated</div></header>
          <main className="dashboard-content"><CategoriesPage type={type}/></main></div></div>);
      };`, resolveDir: project, loader: 'jsx' },
    bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', write: false,
    define: {'process.env.NODE_ENV':'"production"'}, loader: {'.png':'dataurl','.jpg':'dataurl'},
    plugins: [{name:'isolated-category-fixture',setup(b) {
      b.onResolve({filter:/^\.\.\/api\/(categories|catalog)$/}, a => ({path:a.path,namespace:'fixture-api'}));
      b.onLoad({filter:/.*/,namespace:'fixture-api'}, () => ({contents:`export const getCategories = () => window.fixturePending ? new Promise(resolve => {window.finishFixtureLoad = () => resolve({data:window.fixtureRows});}) : Promise.resolve({data:window.fixtureRows}); export const catalogService = {};`,loader:'js'}));
      b.onLoad({filter:/CategoriesPage\.jsx$/}, () => ({contents:fs.readFileSync(before ? path.join(output,'category-height-v13-before.jsx') : path.join(project,'src/pages/CategoriesPage.jsx'),'utf8'),loader:'jsx',resolveDir:path.join(project,'src/pages')}));
      b.onLoad({filter:/\.css$/}, () => ({contents:'',loader:'js'}));
    }}]
  })).outputFiles[0].text;
}
async function measure(page) {
  return page.evaluate(() => {
    const list = document.querySelector('.rawcat-list, .dishcat-list');
    const card = document.querySelector('.menu-categories-card');
    const rows = [...list.querySelectorAll('article')];
    const rect = e => {const {x,y,width,height,top,bottom}=e.getBoundingClientRect();return {x,y,width,height,top,bottom};};
    const style = getComputedStyle(list);
    const content = document.querySelector('.dashboard-content');
    const ancestors = [];
    for(let parent=list.parentElement;parent;parent=parent.parentElement) {
      const s=getComputedStyle(parent);
      ancestors.push({className:parent.className,height:s.height,minHeight:s.minHeight,maxHeight:s.maxHeight,display:s.display,overflow:s.overflow,paddingBottom:s.paddingBottom,marginBottom:s.marginBottom,borderBottomWidth:s.borderBottomWidth});
      if(parent===content) break;
    }
    let reservedGap=parseFloat(getComputedStyle(card).marginBottom)||0;
    for(let parent=card.parentElement;parent;parent=parent.parentElement) {
      const s=getComputedStyle(parent);
      reservedGap+=(parseFloat(s.paddingBottom)||0)+(parseFloat(s.borderBottomWidth)||0);
      if(parent===content) break;
      reservedGap+=parseFloat(s.marginBottom)||0;
    }
    return {viewport:{width:innerWidth,height:innerHeight},card:rect(card),list:rect(list),
      clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,scrollTop:list.scrollTop,
      cap:style.maxHeight,display:style.display,overflow:style.overflowY,scrollbar:style.scrollbarWidth,
      webkitScrollbar:getComputedStyle(list,'::-webkit-scrollbar').display,
      rowCount:rows.length,first:rows[0]?rect(rows[0]):null,last:rows.length?rect(rows.at(-1)):null,
      visibleRows:rows.filter(r=>r.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom+1).length,
      lastRadius:rows.length?getComputedStyle(rows.at(-1)).borderRadius:null,
      bottomGap:innerHeight-card.getBoundingClientRect().bottom,
      reservedGap,ancestors,
      outerOverflow:document.documentElement.scrollHeight-innerHeight,
      horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
      empty:!!document.querySelector('.menu-category-empty'),png:!!card.querySelector('.menu-category-empty img')};
  });
}
async function settle(page) {
  await page.evaluate(() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.waitForTimeout(300);
}
(async () => {
  const script = await bundle();
  const browser = await chromium.launch({headless:true});
  const results=[];
  const record = async (page, name, check) => {
    await settle(page);
    const result = await measure(page);
    results.push({name,...result});
    if (!before && check) check(result);
    return result;
  };
  try {
    for(const viewport of [{width:1918,height:1194},{width:1440,height:900},{width:1024,height:768},{width:390,height:845}]) {
      const context = await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
      await context.route('**/*',r=>r.abort());
      const page = await context.newPage();
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="dashboard-body"><div id="fixture"></div><script>${script}</script></body></html>`);
      for(const type of ['dishes','raw']) {
        const prefix=`${viewport.width}-${type}`;
        const render = async (a,b=2,pending=false) => {
          await page.evaluate(args=>window.renderCategoryFixture(...args),[type,a,b,pending]);
          await page.waitForSelector('.rawcat-list, .dishcat-list');
          if(!pending) await page.waitForFunction(()=>document.querySelector('[aria-busy="false"]'));
        };
        for(const count of [1,4,8,12,30]) {
          await render(count);
          const m = await record(page,`${prefix}-${count}-active`,r=>{
            assert.equal(r.rowCount,count);
            assert.equal(r.horizontalOverflow,0,'No horizontal page overflow');
            assert.equal(r.scrollbar,'none');
            assert.equal(r.webkitScrollbar,'none');
            assert.equal(r.lastRadius,'14px');
            assert.ok(r.bottomGap>=0,'Card fits viewport');
            if(count===1 || (count===4 && viewport.width>390)) {
              assert.ok(r.scrollHeight <= r.clientHeight+1,'Few rows shrink-wrap');
              assert.ok(r.last.bottom <= r.list.bottom+1,'Last row visible');
            }
            if(count===12 && viewport.height>=1194) {
              assert.ok(r.scrollHeight<=r.clientHeight+1,'12 desktop rows all visible');
              assert.equal(r.visibleRows,12);
            }
            if(count===8 && viewport.height>=900) {
              assert.ok(r.scrollHeight<=r.clientHeight+1,'8 desktop rows all visible');
              assert.equal(r.visibleRows,8);
            }
            if(count===30) {
              assert.ok(r.scrollHeight>r.clientHeight,'Excess rows scroll internally');
              assert.ok(Math.abs(r.bottomGap-r.reservedGap)<=1,'Only existing workspace bottom padding remains when clipped');
              assert.ok(r.outerOverflow<=1,'No outer scroll caused by rows');
            }
          });
          if(count===12 || count===30) await page.screenshot({path:path.join(output,`category-height-${before?'before':'after'}-${prefix}-${count}.png`)});
          if(count===30) {
            if(!before) {
              const list=page.locator('.rawcat-list, .dishcat-list');
              const box=await list.boundingBox();
              await page.mouse.move(box.x+20,box.y+20);
              await page.mouse.wheel(0,200);
              await record(page,`${prefix}-wheel`,r=>assert.ok(r.scrollTop>0,'Mouse wheel scrolls list'));
              await page.evaluate(()=>{document.querySelector('.rawcat-list, .dishcat-list').scrollTop=0;});
              await list.focus();
              await page.keyboard.press('PageDown');
              await record(page,`${prefix}-keyboard`,r=>assert.ok(r.scrollTop>0,'PageDown scrolls focused list'));
            }
            await page.evaluate(()=>{const l=document.querySelector('.rawcat-list, .dishcat-list');l.scrollTop=l.scrollHeight;});
            await record(page,`${prefix}-last-reachable`,r=>assert.ok(r.last.bottom<=r.list.bottom+1,'Last rounded row reachable'));
            await page.screenshot({path:path.join(output,`category-height-${before?'before':'after'}-${prefix}-last.png`)});
            await page.getByRole('tab',{name:'Архивированные'}).click();
            await record(page,`${prefix}-2-archived`,r=>{assert.equal(r.rowCount,2);assert.ok(r.scrollHeight<=r.clientHeight+1);});
            await page.getByRole('tab',{name:'Активные'}).click();
            await record(page,`${prefix}-back-active`,r=>assert.equal(r.rowCount,30));
          }
        }
        await render(0,30);
        await record(page,`${prefix}-empty-active`,r=>{assert.ok(r.empty);assert.equal(r.png,false);assert.ok(r.card.height<viewport.height*.65);});
        await page.screenshot({path:path.join(output,`category-height-${before?'before':'after'}-${prefix}-empty-active.png`)});
        await page.getByRole('tab',{name:'Архивированные'}).click();
        await record(page,`${prefix}-empty-to-many`,r=>{assert.equal(r.rowCount,30);assert.ok(r.scrollHeight>r.clientHeight);});
        await render(30,0);
        await page.getByRole('tab',{name:'Архивированные'}).click();
        await record(page,`${prefix}-empty-archived`,r=>{assert.ok(r.empty);assert.equal(r.png,false);assert.ok(r.card.height<viewport.height*.65);});
        await page.screenshot({path:path.join(output,`category-height-${before?'before':'after'}-${prefix}-empty-archived.png`)});
        await render(12,2,true);
        const loading = await record(page,`${prefix}-loading`);
        await page.evaluate(()=>window.finishFixtureLoad());
        await record(page,`${prefix}-loaded`,r=>{assert.equal(r.rowCount,12);assert.equal(r.cap,loading.cap,'No stale cap after loading');});
        await page.evaluate(()=>{const s=document.querySelector('.dashboard-shell');s.classList.remove('is-sidebar-expanded');s.classList.add('is-sidebar-collapsed');document.querySelector('.dashboard-main').classList.add('is-sidebar-collapsed');});
        await record(page,`${prefix}-collapsed`,r=>{assert.equal(r.rowCount,12);assert.equal(r.horizontalOverflow,0);});
        await page.setViewportSize({width:viewport.width,height:viewport.height-100});
        await record(page,`${prefix}-resized`,r=>assert.ok(r.bottomGap>=0));
        await page.setViewportSize(viewport);
        await record(page,`${prefix}-resize-back`,r=>assert.ok(r.bottomGap>=0));
        await page.setViewportSize(viewport.width===390?{width:1024,height:768}:{width:390,height:845});
        await record(page,`${prefix}-width-resized`,r=>{assert.ok(r.bottomGap>=0);assert.equal(r.horizontalOverflow,0);});
        await page.setViewportSize(viewport);
        await record(page,`${prefix}-width-resize-back`,r=>assert.ok(r.bottomGap>=0));
      }
      assert.deepEqual(errors,[],'No observer loops/browser runtime errors');
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output,`category-height-${before?'before':'after'}-geometry.json`),JSON.stringify(results,null,2));
  }
  process.stdout.write(JSON.stringify({mode:before?'before audit':'offline browser regression',states:results.length,
    results:results.filter(r=>/12-active|30-active/.test(r.name)).map(r=>({name:r.name,cap:r.cap,clientHeight:r.clientHeight,scrollHeight:r.scrollHeight,visibleRows:r.visibleRows,bottomGap:r.bottomGap}))},null,2));
})().catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
