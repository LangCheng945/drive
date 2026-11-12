import fs from 'node:fs';
import path from 'node:path';
const lock = JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const rows = [];
fs.mkdirSync('docs/licenses',{recursive:true});
for(const [location, entry] of Object.entries(lock.packages)) {
  if(!location) continue;
  const pkgPath = path.join(location,'package.json');
  if(!fs.existsSync(pkgPath)) continue;
  const p = JSON.parse(fs.readFileSync(pkgPath,'utf8'));
  rows.push({name:p.name,version:p.version,license:p.license ?? 'SEE PACKAGE',development:!!entry.dev});
  if(!entry.dev) {
    for(const file of fs.readdirSync(location).filter(n=>/^(license|licence|copying|notice)(\.|$)/i.test(n))) {
      if(fs.statSync(path.join(location,file)).isFile()) fs.copyFileSync(path.join(location,file),path.join('docs/licenses',`${p.name.replaceAll('/','__')}--${file}`));
    }
  }
}
rows.sort((a,b)=>a.name.localeCompare(b.name));
fs.writeFileSync('docs/dependency-licenses.json',JSON.stringify(rows,null,2)+'\n');
console.log(`Inventoried ${rows.length} installed packages; retained production notices.`);
