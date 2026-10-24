import {onMount, onCleanup, Show, type JSX} from 'solid-js';
export function Modal(props: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: JSX.Element;
}) {
  let dialog!: HTMLDivElement;
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.querySelector<HTMLElement>('input, button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.close();
      if (event.key === 'Tab') {
        const elements = [
          ...dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        ];
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    onCleanup(() => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    });
  });
  return (
    <div class="modal-backdrop">
      <div ref={dialog} class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header>
          <div>
            <span class="stamp">WORKSPACE OPERATION</span>
            <h2 id="modal-title">{props.title}</h2>
            <Show when={props.subtitle}>
              <p>{props.subtitle}</p>
            </Show>
          </div>
          <button class="icon-button" aria-label="Close dialog" onClick={props.close}>
            ×
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}
