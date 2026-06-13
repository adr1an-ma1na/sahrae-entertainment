import { ShaderAnimation } from "@/components/ui/shader-animation";

/**
 * Reference demo for the ShaderAnimation background (Sahrae-themed).
 * The real integration lives in SplashScreen + ProfileSelection.
 */
export default function ShaderAnimationDemo() {
  return (
    <div className="relative flex h-[650px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black">
      <ShaderAnimation className="absolute inset-0 h-full w-full opacity-70" />
      <span className="absolute pointer-events-none z-10 text-center text-7xl leading-none font-semibold tracking-tighter whitespace-pre-wrap bg-gradient-to-b from-amber-100 via-amber-400 to-amber-600 bg-clip-text text-transparent">
        Shader Animation
      </span>
    </div>
  );
}
