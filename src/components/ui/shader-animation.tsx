import { useEffect, useRef } from "react";
import * as THREE from "three";
import { gpuReport } from "../../services/gpu";

/**
 * Sahrae premium shader background.
 *
 * A GPU shader of soft golden light-filaments radiating over deep black —
 * themed to Sahrae's amber-on-zinc/black identity (the skill's "premium dark +
 * gold accent" luxury palette) rather than the original RGB rainbow.
 *
 * Dark areas render transparent, so it layers cleanly over any black/zinc
 * background. Tuned for mobile/TV: device-pixel-ratio is capped, it honours
 * `prefers-reduced-motion` (renders a single still frame), and it pauses while
 * the app is backgrounded to save battery. Falls back gracefully (renders
 * nothing) if WebGL is unavailable.
 */
interface ShaderAnimationProps {
  className?: string;
}

export function ShaderAnimation({ className }: ShaderAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const vertexShader = `
      void main() {
        gl_Position = vec4( position, 1.0 );
      }
    `;

    // Golden filaments on black. `glow` is the original line field; we tint it
    // with Sahrae amber and let bright spikes bloom to a warm highlight, with
    // alpha = glow so the dark areas stay transparent for clean layering.
    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;

      void main(void) {
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        float t = time * 0.03;
        float lineWidth = 0.002;

        float glow = 0.0;
        for (int i = 0; i < 5; i++) {
          glow += lineWidth * float(i * i) /
            abs(fract(t + float(i) * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));
        }

        vec3 amber = vec3(0.96, 0.62, 0.10);   // ~ amber-500
        vec3 hot   = vec3(1.00, 0.91, 0.66);   // warm highlight
        vec3 color = amber * glow + hot * pow(glow, 2.0) * 0.4;

        float alpha = clamp(glow * 1.1, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
      }
    `;

    // Refuse to run on a GPU that is not one.
    //
    // The old guard was the try/catch below alone, which only catches WebGL
    // being ABSENT. Emulators and low-end TV boxes provide a perfectly working
    // context backed by SwiftShader and execute every fragment on the CPU — so
    // the check passed and the app then froze on its own first screen. This is
    // decoration behind a mask at 50% opacity; it is never worth a hang.
    if (!gpuReport().canRunShaders) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // WebGL unavailable — leave the underlying background untouched
    }

    const camera = new THREE.Camera();
    camera.position.z = 1;

    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);
    const uniforms = {
      time: { value: 1.0 },
      resolution: { value: new THREE.Vector2() },
    };
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // cap for mobile/TV
    renderer.setClearColor(0x000000, 0); // transparent clear → only the filaments show
    container.appendChild(renderer.domElement);

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      uniforms.resolution.value.x = renderer.domElement.width;
      uniforms.resolution.value.y = renderer.domElement.height;
    };
    onResize();
    window.addEventListener("resize", onResize, false);

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let rafId = 0;
    let running = false;
    const renderOnce = () => renderer.render(scene, camera);
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      uniforms.time.value += 0.03;
      renderOnce();
    };
    const start = () => {
      if (running) return;
      running = true;
      animate();
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };

    if (reduceMotion) {
      uniforms.time.value = 12.0; // a pleasing still frame
      renderOnce();
    } else {
      start();
    }

    // Pause while the app is backgrounded.
    const onVisibility = () => {
      if (reduceMotion) return;
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className={className ?? "w-full h-full"} style={{ overflow: "hidden" }} />
  );
}
