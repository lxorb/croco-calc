import { Icon } from "../../common/Icon";

/** The test page's load spinner, mounted from `test.html`'s `.loading` block. */
export function LoadingSpinner() {
  return <Icon icon="ph:circle-notch-bold" spin />;
}
