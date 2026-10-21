import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
const target = path.join(repo, 'app/src/main/assets/lost-found');
if (!target.startsWith(path.join(repo, 'app/src/main/assets') + path.sep) || path.basename(target) !== 'lost-found') throw new Error('Invalid bundle target');
if (existsSync(target)) rmSync(target, {recursive:true});
mkdirSync(target,{recursive:true}); cpSync(path.join(root,'dist'),target,{recursive:true});
const notices = ['# Third-party assets', '', 'Photos: created for MyChuannong with OpenAI ImageGen.', 'Radix Icons: MIT, WorkOS / Radix authors.', 'React / React DOM: MIT, Meta Platforms.', 'Radix Dialog: MIT, WorkOS / Radix authors.', 'Noto Sans SC: SIL Open Font License 1.1, Adobe / Google.', ''];
writeFileSync(path.join(target,'LICENSES.txt'), notices.join('\n'));
for(const [pkg,name] of [['react','react'],['react-dom','react-dom'],['@radix-ui/react-icons','radix-icons'],['@radix-ui/react-dialog','radix-dialog'],['@fontsource/noto-sans-sc','noto-sans-sc']]) {
 const dir=path.join(root,'node_modules',pkg); const file=readdirSync(dir).find(f=>/^licen[sc]e|^ofl/i.test(f));
 if(file) writeFileSync(path.join(target,`LICENSE-${name}.txt`),readFileSync(path.join(dir,file)));
}
console.log('Packaged offline lost-found assets.');
