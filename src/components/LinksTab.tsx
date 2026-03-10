/**
 * LinksTab - Flow of URL buttons. Mirrors TabLinks + LinksContainer from UECommandHelper.
 */

import { LinkButton } from './LinkButton';
import { LINKS } from '../config';

export function LinksTab() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Links</h1>
      <p className="text-zinc-400 text-sm">
        Quick access to Unreal Engine docs, forums, and other resources.
      </p>
      <div className="flex flex-wrap gap-5 p-2">
        {LINKS.map((link, i) => (
          <LinkButton key={`${link.url}-${i}`} link={link} />
        ))}
      </div>
    </div>
  );
}
