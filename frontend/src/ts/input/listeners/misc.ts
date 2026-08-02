import {
  getInputElement,
  moveInputElementCaretToTheEnd,
} from "../input-element";

const inputEl = getInputElement();

inputEl.addEventListener("focus", () => {
  moveInputElementCaretToTheEnd();
});

for (const type of ["copy", "paste", "cut", "drop"]) {
  inputEl.addEventListener(type, (event) => {
    event.preventDefault();
  });
}

for (const type of ["select", "selectstart"]) {
  inputEl.addEventListener(type, (event) => {
    event.preventDefault();
  });
}
