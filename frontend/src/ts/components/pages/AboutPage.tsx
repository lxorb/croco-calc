import { useQuery } from "@tanstack/solid-query";
import { For, JSXElement, Show } from "solid-js";

import {
  COMING_SOON_TOOLTIP,
  DEFERRED_FEATURES,
  GITHUB_CONTRIBUTORS_URL,
  GITHUB_REPO_URL,
  MONKEYTYPE_REPO_URL,
  SOCIAL_LINKS,
} from "../../constants/links";
import {
  getContributorsQueryOptions,
  getScoreHistogramQueryOptions,
  getSupportersQueryOptions,
  getTrainingStatsQueryOptions,
} from "../../queries/public";
import { getActivePage } from "../../states/core";
import { showModal } from "../../states/modals";
import { getTheme } from "../../states/theme";
import { getNumberWithMagnitude } from "../../utils/numbers";
import AsyncContent from "../common/AsyncContent";
import { Balloon } from "../common/Balloon";
import { Button } from "../common/Button";
import { ChartJs } from "../common/ChartJs";
import { H2, H3 } from "../common/Headers";
import { Page } from "../common/Page";
import { CommandlineHotkey } from "../hotkeys/CommandlineHotkey";
import { QuickRestartHotkey } from "../hotkeys/QuickRestartHotkey";

/**
 * The about / info page (CP-132 … CP-150).
 *
 * The section order, the heading hierarchy, the three-up stats hero, the
 * chart.js histogram and the auto-fill supporter/contributor grids are all
 * upstream, unchanged — only the copy, the icons and the backing queries
 * (CP-132). The two `Advertisement` blocks the reference rendered between
 * sections are gone (CP-006, INV-189).
 */
export function AboutPage(): JSXElement {
  const isOpen = () => getActivePage() === "about";

  // Both lists are hidden (`DEFERRED_FEATURES`), so their fetches are switched
  // off with them — there is nothing to render the result into. The query
  // options themselves are untouched, so turning a flag back on restores the
  // fetch along with the section.
  const contributors = useQuery(() => ({
    ...getContributorsQueryOptions(),
    enabled: isOpen() && DEFERRED_FEATURES.contributors,
  }));

  const supporters = useQuery(() => ({
    ...getSupportersQueryOptions(),
    enabled: isOpen() && DEFERRED_FEATURES.supporters,
  }));

  // CP-149 — every query is gated on the page actually being open and keeps the
  // one-hour `staleTime` from `queries/public.ts`, so navigating here does not
  // hammer the backend.
  const trainingStats = useQuery(() => ({
    ...getTrainingStatsQueryOptions(),
    enabled: isOpen(),
  }));

  const scoreHistogram = useQuery(() => ({
    ...getScoreHistogramQueryOptions(),
    enabled: isOpen(),
  }));

  const numberOfHistogramRecords = (data?: { y: number }[]): string => {
    if (data === undefined) return "";
    const sum = getNumberWithMagnitude(
      data.reduce((sum, it) => (sum += it.y), 0),
    );
    return `${sum.roundedTo2} ${sum.orderOfMagnitude}`;
  };

  const discordUrl = (): string | null => SOCIAL_LINKS.discord;

  return (
    <Page id="about">
      <div class="content-grid grid gap-8">
        {/* CP-133 — three centred lines. The middle line used to link at the
            `#supporters_title` / `#contributors_title` anchors; those sections
            are hidden (`DEFERRED_FEATURES`), so it credits the upstream project
            instead. A bare `<a>` is `--sub-color` like the text around it and
            only brightens on hover, so the link does not stand out. */}
        <section class="text-center text-sub">
          Created by lxorb.
          <br />
          Based on{" "}
          <a
            href={MONKEYTYPE_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            monkeytype
          </a>
          . Many thanks to miodec &lt;3
          <br />
          Launched in 2026.
        </section>

        {/* CP-134 / CP-135 — the global stats hero. */}
        <section>
          <AsyncContent
            alwaysShowContent
            queries={{ trainingStats }}
            errorMessage="Failed to get global stats"
          >
            {({ trainingStatsData }) => (
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <For
                  each={
                    [
                      [
                        "total tests started",
                        () => trainingStatsData()?.testsStarted,
                      ],
                      [
                        "total time training",
                        () => trainingStatsData()?.timeTraining,
                      ],
                      [
                        "total tests completed",
                        () => trainingStatsData()?.testsCompleted,
                      ],
                    ] as const
                  }
                >
                  {([title, stat]) => (
                    <Balloon text={stat()?.label} position="up">
                      <div class="text-center">
                        <div class="text-sub">{title}</div>
                        <div class="text-5xl">{stat()?.text ?? "-"}</div>
                        <div class="text-xl">{stat()?.subText ?? "-"}</div>
                      </div>
                    </Balloon>
                  )}
                </For>
              </div>
            )}
          </AsyncContent>
        </section>

        {/* CP-136 … CP-138 — the score distribution histogram. */}
        <section class="h-48 w-full">
          <AsyncContent
            alwaysShowContent
            queries={{ scoreHistogram }}
            errorMessage="Failed to get global score distribution"
          >
            {({ scoreHistogramData }) => (
              <>
                <ChartJs
                  name="ScoreHistogram"
                  type="bar"
                  data={{
                    labels: scoreHistogramData()?.labels ?? [],
                    datasets: [
                      {
                        yAxisID: "count",
                        label: "Users",
                        data: scoreHistogramData()?.data ?? [],
                        minBarLength: 2,
                        backgroundColor: getTheme().main,
                        borderColor: getTheme().main,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    hover: {
                      mode: "nearest",
                      intersect: false,
                    },
                    scales: {
                      x: {
                        axis: "x",
                        bounds: "ticks",
                        display: true,
                        title: {
                          display: false,
                          text: "Bucket",
                        },
                        offset: true,
                      },
                      count: {
                        axis: "y",
                        beginAtZero: true,
                        min: 0,
                        ticks: {
                          autoSkip: true,
                          autoSkipPadding: 20,
                          stepSize: 10,
                        },
                        display: true,
                        title: {
                          display: true,
                          text: "Users",
                        },
                      },
                    },
                    plugins: {
                      annotation: {
                        annotations: [],
                      },
                      tooltip: {
                        animation: { duration: 250 },
                        intersect: false,
                        mode: "index",
                        callbacks: {
                          afterLabel: (context) => {
                            return (
                              (context.raw as { topPercentage?: string })
                                .topPercentage ?? ""
                            );
                          },
                        },
                      },
                    },
                  }}
                />
                <div class="text-right text-xs text-sub">
                  distribution of time 8 leaderboard results (score) <br />
                  {numberOfHistogramRecords(scoreHistogramData()?.data)} total
                  results
                </div>
              </>
            )}
          </AsyncContent>
        </section>

        {/* CP-139, as corrected by C34 — seven task settings plus a length. */}
        <section>
          <H2 icon={{ icon: "ph:info-bold" }} text="about" />
          <p>
            croco calc is a minimalistic and customizable mental-arithmetic
            trainer. It features seven independent task settings — addition,
            multiplication, division, fraction addition, fraction
            multiplication, decimals and negative numbers — plus a test length
            of 1, 2, 4 or 8 minutes, an account system to save your score
            history, and user-configurable features such as themes, fonts, live
            readouts, and more. croco calc shows you one task at a time, large
            and centred, so the only thing between you and the next result is
            the arithmetic. Get one wrong and it shows you the right answer and
            waits until you are ready to carry on.
            <br />
            <br />
            Test yourself in various modes, track your progress and get faster.
          </p>
        </section>

        {/* CP-140 — what each of the eight controls in the top bar generates.
            Every rule here is copied from the task-generation requirements
            (ME-027 … ME-119); this section introduces none of its own. */}
        <section>
          <H3 icon={{ icon: "ph:function-bold" }} text="task set" />
          <dl class="grid gap-2">
            <dt class="col-1 mr-4 text-sub">addition</dt>
            <dd class="col-2">
              - two whole numbers whose sum lands in the band the label names:
              <span class="text-main"> +100</span> keeps the sum between 11 and
              100, <span class="text-main">+1000</span> between 101 and 1000.
              Every pair in the band is equally likely. There is no separate
              subtraction setting — subtraction is what the negative numbers
              modifier produces.
            </dd>

            <dt class="col-1 mr-4 text-sub">multiplication</dt>
            <dd class="col-2">
              - both factors are drawn independently from 2 up to 12, 20 or 100,
              matching the <span class="text-main">12x12</span>,{" "}
              <span class="text-main">20x20</span> and{" "}
              <span class="text-main">100x100</span> labels. 0 and 1 are never
              used, because they make the task trivial. Squares are allowed.
            </dd>

            <dt class="col-1 mr-4 text-sub">division</dt>
            <dd class="col-2">
              - <span class="text-main">144/12</span> stays inside the 1x1 …
              12x12 tables. <span class="text-main">xxx/xx</span> gives a
              three-digit dividend and a divisor of at most two digits.
              Divisions never have a remainder: the dividend is built as divisor
              × quotient, so the answer is always whole.
            </dd>

            <dt class="col-1 mr-4 text-sub">fraction addition</dt>
            <dd class="col-2">
              - two fractions with different denominators, chosen so that the
              common denominator you have to bring them onto stays at or below
              12 (<span class="text-main">+1/12</span>) or 99 (
              <span class="text-main">+1/xx</span>). Numerators are always
              smaller than their denominators and both fractions are already in
              lowest terms. The result may come out improper or whole. Any equal
              form of your answer counts — reduced or not, and an exact decimal
              works too.
            </dd>

            <dt class="col-1 mr-4 text-sub">fraction multiplication</dt>
            <dd class="col-2">
              - multiplies two fractions, again with numerators smaller than
              their denominators. Its size follows the multiplication setting,
              so <span class="text-main">100x100</span> gives it denominators up
              to 100. Turning multiplication off turns this off with it; turning
              this on turns multiplication on.
            </dd>

            <dt class="col-1 mr-4 text-sub">decimals</dt>
            <dd class="col-2">
              - a modifier rather than a generator: it takes an ordinary task
              and shifts the decimal point, so{" "}
              <span class="text-main">100 ÷ 4 = 25</span> becomes{" "}
              <span class="text-main">1 ÷ 4 = 0.25</span>. The shift is never
              allowed to leave both operands and the answer whole, so a decimal
              task always really is one.
            </dd>

            <dt class="col-1 mr-4 text-sub">negative numbers</dt>
            <dd class="col-2">
              - the other modifier: for each task it picks one of the two
              operands and, with 50% probability, makes it negative. Exactly one
              operand at most is ever negative — both never happens. The sign
              lands on the whole fraction for fraction tasks and after the shift
              for decimal ones, and the answer is free to fall outside the usual
              band of the setting.
            </dd>

            <dt class="col-1 mr-4 text-sub">time</dt>
            <dd class="col-2">
              - the length of the test: 1, 2, 4 or 8 minutes. Only the 4 and 8
              minute lengths are eligible for the leaderboard, and only when
              every other setting is left at its default.
            </dd>
          </dl>
        </section>

        {/* CP-141 — rendered from the live hotkey state, not hard coded. */}
        <section>
          <H3 icon={{ icon: "ph:keyboard-bold" }} text="keybinds" />
          <p>
            You can use <QuickRestartHotkey /> to restart the test. Open the
            command line by pressing <CommandlineHotkey /> — there you can
            access all the functionality you need without touching your mouse.
          </p>
        </section>

        {/* CP-142 / C40 — every metric the results screen shows. */}
        <section>
          <H3 icon={{ icon: "ph:list-numbers-bold" }} text="stats" />
          <dl class="grid">
            <dt class="col-1 mr-4">score</dt>
            <dd class="col-2">
              - correct tasks minus wrong tasks. Can be negative.
            </dd>

            <dt class="col-1 mr-4">correct</dt>
            <dd class="col-2">- number of tasks you answered correctly.</dd>

            <dt class="col-1 mr-4">wrong</dt>
            <dd class="col-2">- number of tasks you answered incorrectly.</dd>

            <dt class="col-1 mr-4">acc</dt>
            <dd class="col-2">
              - percentage of your answers that were correct.
            </dd>

            <dt class="col-1 mr-4">tpm</dt>
            <dd class="col-2">
              - tasks per minute: every answer you submitted, right or wrong,
              divided by the length of the test in minutes.
            </dd>

            <dt class="col-1 mr-4">tasks</dt>
            <dd class="col-2">- total number of answers you submitted.</dd>

            <dt class="col-1 mr-4">avg time</dt>
            <dd class="col-2">- average number of seconds per answer.</dd>

            <dt class="col-1 mr-4">consistency</dt>
            <dd class="col-2">
              - based on the variance of your per-task answer times. Closer to
              100% is better. Calculated using the coefficient of variation of
              those times and mapped onto a scale from 0 to 100.
            </dd>

            {/* C37 — the user-visible label is `idle`; the results screen
                renders `12s idle`, so the glossary must match it. */}
            <dt class="col-1 mr-4">idle</dt>
            <dd class="col-2">
              - seconds during the test in which you pressed no key.
            </dd>
          </dl>
        </section>

        {/* CP-143 */}
        <section>
          <H3 icon={{ icon: "ph:chart-line-bold" }} text="results screen" />
          <p>
            After completing a test you will be able to see your score, correct
            and wrong counts, accuracy, tasks per minute, consistency, test
            length, leaderboard info and test info (you can hover over some
            values to get exact numbers). You can also see a graph of your score
            over the duration of the test, with a marker for every task you got
            wrong. Remember that the score line is cumulative, while the
            tasks-per-minute line is a running average.
          </p>
        </section>

        {/* CP-144 — discord is deliberately not offered while it is deferred. */}
        <section>
          <H3
            icon={{ icon: "ph:bug-bold" }}
            text="bug report or feature request"
          />
          <p>
            If you encounter a bug, or have a feature request - send me an email
            or create an issue on GitHub.
          </p>
        </section>
        <div></div>

        {/* CP-145 — hidden while support is deferred, together with its
            trailing spacer so the page does not keep a gap where it was. */}
        <Show when={DEFERRED_FEATURES.support}>
          <section>
            <H2 icon={{ icon: "ph:lifebuoy-bold" }} text="support" />
            <p>
              Thanks to everyone who has supported this project. It would not be
              possible without you and your continued support.
            </p>
            <div class="mt-4 text-xl">
              <Button
                icon={{ icon: "ph:hand-heart-bold" }}
                onClick={() => showModal("Support")}
                text="support"
                class="w-full p-8"
              />
            </div>
          </section>
          <div></div>
        </Show>

        {/* CP-146 — twitter is gone and discord is hidden
            (`DEFERRED_FEATURES.discord`), so the grid holds mail and github
            and is two wide at `sm` and up; three across would leave a third of
            the row empty. Put `lg:grid-cols-3` back when discord returns.
            The discord button still honours CP-017 behind the flag: with no
            invite it renders disabled behind a `coming soon` tooltip rather
            than linking nowhere, and the tooltip sits on a wrapper because a
            disabled button sets `pointer-events: none` and would never see the
            hover itself. */}
        <section>
          <H2 icon={{ icon: "ph:envelope-simple-bold" }} text="contact" />
          <p>
            If you encounter a bug, have a feature request or just want to say
            hi - here are the different ways you can contact me directly.
          </p>
          <div class="mt-4 grid w-full grid-cols-1 gap-4 text-xl sm:grid-cols-2">
            <Button
              text="mail"
              icon={{ icon: "ph:envelope-simple-bold" }}
              onClick={() => showModal("Contact")}
              class="w-full p-8"
            />
            <Show when={DEFERRED_FEATURES.discord}>
              <Show
                when={discordUrl()}
                fallback={
                  <Balloon text={COMING_SOON_TOOLTIP} position="up">
                    <Button
                      text="discord"
                      icon={{ icon: "ph:discord-logo-bold" }}
                      disabled
                      class="w-full p-8"
                    />
                  </Balloon>
                }
              >
                {(url) => (
                  <Button
                    text="discord"
                    icon={{ icon: "ph:discord-logo-bold" }}
                    href={url()}
                    class="w-full p-8"
                  />
                )}
              </Show>
            </Show>
            <Button
              text="github"
              icon={{ icon: "ph:github-logo-bold" }}
              href={GITHUB_REPO_URL}
              class="w-full p-8"
            />
          </div>
        </section>
        <div></div>

        {/* CP-147 — the upstream credit is mandatory and may not be removed:
            croco calc is a direct adaptation of a GPL-licensed codebase. This
            section, the about-page hero and the footer credit are the places in
            `frontend/src` the DoD-07 vocabulary grep is allowed to match; the
            longer form of the credit belongs here.

            The `Supporters` entry anchors at `#supporters_title`, so it is tied
            to the same flag as the section it points at — otherwise it would be
            a link to nothing. `Contributors` points at GitHub, not at an
            in-page anchor, so it stands on its own. */}
        <section>
          <H2 icon={{ icon: "ph:users-bold" }} text="credits" />
          <p>
            <Button
              variant="text"
              text="Monkeytype"
              href={MONKEYTYPE_REPO_URL}
              class="p-0 pt-2 pr-2 pb-2"
            />
            and its authors, for the design and the codebase croco calc is
            adapted from
          </p>
          <p class="py-2">
            Special thanks to Miodec, monkeytype&apos;s creator and maintainer —
            croco calc would not exist without that work. croco calc is
            distributed under the GPL-3.0, like the code it is adapted from (see
            LICENSE and NOTICE in the repository).
          </p>
          <Show when={DEFERRED_FEATURES.supporters}>
            <p>
              <Button
                variant="text"
                text="Supporters"
                href="#supporters_title"
                class="p-0 pt-2 pr-2 pb-2"
              />
              who helped financially by donating
            </p>
          </Show>
          <p>
            <Button
              variant="text"
              text="Contributors"
              href={GITHUB_CONTRIBUTORS_URL}
              class="p-0 pt-2 pr-2 pb-2"
            />
            on GitHub that have helped with implementing various features,
            adding themes and more
          </p>
        </section>

        {/* CP-148 — both lists ship empty (`[]`) and render as empty grids
            rather than erroring, which is exactly why they are hidden: two
            headings over two blank grids is not worth a screenful. Each keeps
            its own leading spacer inside the `<Show>`, so with both off the
            page ends on the credits section with no trailing gap, and with
            either back on the original section/spacer rhythm returns. The
            `supporters` / `contributors` queries above stay gated on the page
            being open and are simply not consumed while this is off. */}
        <Show when={DEFERRED_FEATURES.supporters}>
          <div></div>
          <section>
            <H2
              id="supporters_title"
              icon={{ icon: "ph:hand-coins-bold" }}
              text="top supporters"
            />
            <AsyncContent
              queries={{ supporters }}
              errorMessage="Failed to get supporters"
            >
              {({ supportersData }) => (
                <div
                  class="grid"
                  style={{
                    "grid-template-columns":
                      "repeat(auto-fill, minmax(13em, 1fr))",
                  }}
                >
                  <For each={supportersData()}>
                    {(name) => <div>{name}</div>}
                  </For>
                </div>
              )}
            </AsyncContent>
          </section>
        </Show>

        <Show when={DEFERRED_FEATURES.contributors}>
          <div></div>
          <section>
            <H2
              id="contributors_title"
              icon={{ icon: "ph:git-branch-bold" }}
              text="contributors"
            />
            <AsyncContent
              queries={{ contributors }}
              errorMessage="Failed to get contributors"
            >
              {({ contributorsData }) => (
                <div
                  class="grid"
                  style={{
                    "grid-template-columns":
                      "repeat(auto-fill, minmax(13em, 1fr))",
                  }}
                >
                  <For each={contributorsData()}>
                    {(name) => <div>{name}</div>}
                  </For>
                </div>
              )}
            </AsyncContent>
          </section>
        </Show>
      </div>
    </Page>
  );
}
