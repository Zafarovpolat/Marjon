// Native button clicks produced by Enter/Space have detail === 0. Pointer
// clicks have a positive detail, so they can skip trigger-focus restoration
// without weakening the card's keyboard focus contract.
export function prepareKpiDialogTrigger(event, returnFocusRef) {
  const trigger = event.currentTarget;
  const openedWithKeyboard = event.detail === 0;
  const sourceRect = trigger.getBoundingClientRect();

  returnFocusRef.current = openedWithKeyboard ? trigger : null;
  if (!openedWithKeyboard) trigger.blur();

  return sourceRect;
}
