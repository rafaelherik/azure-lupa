import { useSyncExternalStore } from "react";

let message: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function toast(text: string) {
  message = text;
  emit();
  clearTimeout(timer);
  timer = setTimeout(() => {
    message = null;
    emit();
  }, 1800);
}

export async function copy(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast("Copy failed: clipboard not available");
  }
}

export function Toaster() {
  const text = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => message,
  );
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-14 z-50 flex justify-center">
      {text && (
        <div className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-bg shadow-overlay">{text}</div>
      )}
    </div>
  );
}
