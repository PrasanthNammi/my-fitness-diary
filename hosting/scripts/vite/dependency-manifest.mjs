import fs from 'node:fs';
import path from 'node:path';

// Optional, build-only evidence for dependency reachability reviews. Never served.
export function dependencyManifest() {
  return {
    name: 'mfd-dependency-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (!process.env.MFD_DEPENDENCY_MANIFEST) return;
      if (!/^[a-zA-Z0-9_-]+$/.test(process.env.MFD_DEPENDENCY_MANIFEST)) throw new Error('Invalid dependency manifest label');
      const name = this.environment?.name || 'unknown';
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(item => ({
        file: item.fileName,
        imports: item.imports,
        dynamicImports: item.dynamicImports,
        modules: Object.keys(item.modules),
      }));
      const directory = path.resolve('.sites-runtime/dependency-manifests', process.env.MFD_DEPENDENCY_MANIFEST);
      fs.mkdirSync(directory, {recursive: true});
      fs.writeFileSync(path.join(directory, name + '.json'), JSON.stringify(chunks, null, 2));
    },
  };
}
