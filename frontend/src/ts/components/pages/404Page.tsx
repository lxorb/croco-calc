import { Button } from "../common/Button";
import { H2 } from "../common/Headers";
import { Icon } from "../common/Icon";
import { Page } from "../common/Page";

export function NotFoundPage() {
  return (
    <Page id="404">
      <div class="flex h-full items-center justify-center">
        <div class="flex flex-col gap-16 md:flex-row">
          <div class="place-self-center text-sub-alt">
            <Icon icon="ph:calculator-bold" size={12} />
          </div>
          <div class="flex max-w-md flex-col items-center gap-4">
            <H2 text="404" class="pb-0 text-7xl text-main" />
            <p class="text-center">
              Ooops! Looks like this page
              <br />
              or resource doesn&apos;t exist.
            </p>
            <Button
              icon={{ icon: "ph:house-bold" }}
              text="Go Home"
              router-link
              href="/"
              class="px-8 py-4"
            />
          </div>
        </div>
      </div>
    </Page>
  );
}
