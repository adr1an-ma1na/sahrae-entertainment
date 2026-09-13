import { type LucideIcon } from 'lucide-react';
import Illustration, { type IllustrationName } from './ui/Illustration';

/**
 * A guided empty state — turns a dead-end screen into a next step.
 *
 * An illustration when one fits, otherwise the icon tile. The illustration is
 * the point of an empty screen being worth looking at: a lone icon in a large
 * dark area reads as "something failed to load", while a composed scene reads
 * as "nothing here yet, and that is fine".
 */
export default function EmptyState({
  icon: Icon, illustration, title, message, actionLabel, onAction, compact = false,
}: {
  icon?: LucideIcon;
  illustration?: IllustrationName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Inline use inside a section, rather than filling a whole screen. */
  compact?: boolean;
}) {
  return (
    <div className={compact
      ? 'flex flex-col items-center justify-center text-center px-6 py-10'
      : 'min-h-[56vh] flex flex-col items-center justify-center text-center px-6 pt-[calc(env(safe-area-inset-top)+6rem)] md:pt-24'}>
      {illustration ? (
        <Illustration name={illustration} className={compact ? 'w-40 h-auto mb-3' : 'w-52 md:w-60 h-auto mb-5'} />
      ) : Icon ? (
        <div className="w-20 h-20 rounded-3xl glass flex items-center justify-center mb-6">
          <Icon className="w-9 h-9 text-sauti" />
        </div>
      ) : null}
      <h2 className={`${compact ? 'text-lg' : 'text-2xl'} font-display font-bold text-white mb-2`}>{title}</h2>
      <p className="text-zinc-400 max-w-sm leading-relaxed mb-7">{message}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} tabIndex={0} data-tv-focusable className="btn-gold px-7 py-3 rounded-full font-bold">{actionLabel}</button>
      )}
    </div>
  );
}
