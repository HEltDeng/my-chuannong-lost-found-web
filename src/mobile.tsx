import { forwardRef, useRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type PropsWithChildren } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Cross2Icon } from '@radix-ui/react-icons';

// The Android Activity owns system insets, the real keyboard and navigation.
// This adapter renders only app content; the approved preview runtime stays intact.
export function useKeyboard() { return { hide: () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); } }; }
export function useKeyboardInsets() { return { bottomInset: 0, isKeyboardVisible: false }; }
export function useMobileDevice() { return { device: { geometry: { safeArea: { top: 0 } } } }; }
export function useScreenPortal() { return { screenRef: useRef<HTMLDivElement>(null) }; }
export const KeyboardInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((props, ref) => <input {...props} ref={ref} />);
export const KeyboardTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) => <textarea {...props} ref={ref} />);
export function MobileScroll({ children, className = '' }: PropsWithChildren<{className?: string}>) { return <section className={`native-scroll ${className}`}>{children}</section>; }
export function BottomSheet({ open, onOpenChange, title, description, children }: PropsWithChildren<{open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; snap?: number}>) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="native-sheet-overlay" /><Dialog.Content className="bottom-sheet native-sheet" onOpenAutoFocus={e => { e.preventDefault(); (document.activeElement as HTMLElement)?.blur?.(); }}>
    <div className="native-sheet-handle" /><div className="sheet-header"><Dialog.Title className="sheet-title">{title}</Dialog.Title><Dialog.Description className="sheet-description">{description}</Dialog.Description><Dialog.Close className="native-sheet-close" aria-label="关闭"><Cross2Icon /></Dialog.Close></div><div className="sheet-content">{children}</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
