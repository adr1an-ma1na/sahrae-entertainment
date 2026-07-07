import { type LucideIcon } from 'lucide-react';

/**
 * A guided empty state — turns a dead-end screen into a next step. Icon, a
 * friendly title + message, and an optional CTA that routes the user to where
 * they can fill it.
 */
export default function EmptyState({ icon: Icon, title, message, actionLabel, onAction }: {
  icon: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="min-h-[56vh] flex flex-col items-center justify-center text-center px-6 pt-[calc(env(safe-area-inset-top)+6rem)] md:pt-24">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-white/10 to-white/[0.03] border border-white/10 flex items-center justify-center mb-6 shadow-lg">
        <Icon className="w-9 h-9 text-sauti" />
      </div>
      <h2 className="text-2xl font-display font-bold text-white mb-2 tracking-tight">{title}</h2>
      <p className="text-zinc-400 max-w-sm leading-relaxed mb-7">{message}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} tabIndex={0} data-tv-focusable className="btn-gold px-7 py-3 rounded-full font-bold">{actionLabel}</button>
      )}
    </div>
  );
}
