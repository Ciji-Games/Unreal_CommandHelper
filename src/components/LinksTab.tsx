/**
 * LinksTab - Flow of URL buttons by category. Mirrors TabLinks + LinksContainer from UECommandHelper.
 */

import { LinkButton } from './LinkButton';
import { LINK_CATEGORIES } from '../config';

export function LinksTab() {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-slate-100 tracking-tight">Links</h1>
        <p className="text-slate-400 text-sm">
          Quick access to Unreal Engine docs, forums, and other resources.
        </p>
      </header>
      {LINK_CATEGORIES.map((category) => (
        <section key={category.name} className="space-y-3">
          <h2 className="text-sm font-medium text-slate-300 uppercase tracking-wider">{category.name}</h2>
          <div className="flex flex-wrap gap-3">
            {category.links.map((link, i) => (
              <LinkButton key={`${link.url}-${i}`} link={link} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
