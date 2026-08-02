const elem = document.querySelector<HTMLElement>(".pageTest #testInitFailed");
// The test wrapper's id is `tasksTest` (CP-020 renamed the prose-era ids on
// this page). WP-06 owns `frontend/src/html/pages/test.html`, where the id
// itself lives.
const testElem = document.querySelector<HTMLElement>(".pageTest #tasksTest");
const errorElem = document.querySelector<HTMLElement>(
  ".pageTest #testInitFailed .error",
);

export function show(): void {
  if (elem && testElem) {
    elem.classList.remove("hidden");
    testElem.classList.add("hidden");
  }
}

function hideError(): void {
  if (errorElem) {
    errorElem.classList.add("hidden");
  }
}

export function showError(text: string): void {
  if (errorElem) {
    errorElem.classList.remove("hidden");
    errorElem.innerText = text;
  }
}

export function hide(): void {
  if (elem && testElem) {
    hideError();
    elem.classList.add("hidden");
    testElem.classList.remove("hidden");
  }
}
