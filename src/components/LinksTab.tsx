/**
 * LinksTab - Flow of URL buttons by category. Mirrors TabLinks + LinksContainer from UECommandHelper.
 */

import { LinkButton } from './LinkButton';
import { LINK_CATEGORIES } from '../config';

export function LinksTab() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-white">Links</h1>
      <p className="text-zinc-400 text-sm">
        Quick access to Unreal Engine docs, forums, and other resources.
      </p>
      {LINK_CATEGORIES.map((category) => (
        <section key={category.name}>
          <h2 className="text-lg font-semibold text-amber-500 mb-2">{category.name}</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {category.links.map((link, i) => (
              <LinkButton key={`${link.url}-${i}`} link={link} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
