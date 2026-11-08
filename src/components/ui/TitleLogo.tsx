import { useEffect, useState } from 'react';
import { fetchTitleLogo, knownTitleLogo } from '../../services/tmdb';

/**
 * A film's or series' own title treatment over its artwork, the signature of a
 * premium streaming page. The title in type until the logo is known, or when
 * the studio has none that reads on a dark picture.
 */
export default function TitleLogo({ id, type, title, textClassName, imgClassName = '' }: {
  id: number; type: 'movie' | 'tv'; title: string; textClassName: string; imgClassName?: string;
}) {
  const [logo, setLogo] = useState<string>(() => knownTitleLogo(id, type) || '');
  useEffect(() => {
    let live = true;
    setLogo(knownTitleLogo(id, type) || '');
    void fetchTitleLogo(id, type).then((u) => { if (live) setLogo(u); });
    return () => { live = false; };
  }, [id, type]);

  if (logo) {
    return (
      <h1 className="m-0">
        <span className="sr-only">{title}</span>
        <img src={logo} alt="" decoding="async" className={`object-contain object-left drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)] ${imgClassName}`} />
      </h1>
    );
  }
  return <h1 className={textClassName}>{title}</h1>;
}
