// The invoker is passed explicitly across asynchronous handlers. A replacement
// or nested modal keeps its focus; a refused close never invokes this callback.
export function restoreDialogInvoker(dialog, invoker, document = globalThis.document) {
  dialog.addEventListener("close", () => {
    queueMicrotask(() => {
      const open = [...document.querySelectorAll("dialog[open]")].at(-1);
      if (invoker?.isConnected && !invoker.disabled && (!open || open.contains(invoker))) invoker.focus();
    });
  });
}
