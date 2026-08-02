import { VALID_LEADERBOARD_MATRIX } from "@croco-calc/schemas/leaderboards";
import { Accessor, For, JSXElement, Show } from "solid-js";

import { isAuthenticated } from "../../../states/core";
import { Selection } from "../../../states/leaderboard-selection";
import { Button } from "../../common/Button";

type GroupItem<T> = { id: T; text: string; icon: string };

export type ModeSelect = Pick<Selection, "mode" | "mode2">;

/**
 * AC-112 / AC-113 — the duration group is `time 4` and `time 8` and nothing
 * else, taken straight from the AC-114 matrix in `@croco-calc/schemas` so the
 * sidebar, the URL parser and the server all read one source. There is no
 * language axis anywhere on this page.
 */
const MODE_BUTTONS: GroupItem<ModeSelect>[] =
  VALID_LEADERBOARD_MATRIX.allTime.time.map((mode2) => ({
    id: { mode: "time", mode2 },
    text: `time ${mode2}`,
    icon: "ph:clock-bold",
  }));

export function Sidebar(props: {
  selection: Accessor<Selection>;
  onSelect: (selection: Selection) => void;
  connectionsEnabled: boolean;
}): JSXElement {
  const updateSelection = (patch: Partial<Selection>): void => {
    props.onSelect(
      normalizeSelection({ ...props.selection(), ...patch } as Selection),
    );
  };

  const selectType = (type: Selection["type"]): void => {
    updateSelection({ type });
  };

  const selectMode = (value: ModeSelect): void => {
    updateSelection({ mode: value.mode, mode2: value.mode2 });
  };

  const selectFriendsOnly = (friendsOnly: boolean): void => {
    updateSelection({ friendsOnly });
  };

  return (
    <>
      {/* AC-110 — `all-time` drops the upstream language segment. */}
      <Group
        selected={props.selection().type}
        onSelect={selectType}
        items={[
          {
            id: "allTime",
            text: "all-time",
            icon: "ph:globe-hemisphere-west-bold",
          },
          { id: "weekly", text: "weekly xp", icon: "ph:calendar-dot-bold" },
          { id: "daily", text: "daily", icon: "ph:sun-bold" },
        ]}
      />

      {/* AC-111 — audience group, signed-in visitors with connections only. */}
      <Show when={isAuthenticated() && props.connectionsEnabled}>
        <Group
          selected={props.selection().friendsOnly}
          onSelect={selectFriendsOnly}
          items={[
            { id: false, text: "everyone", icon: "ph:users-three-bold" },
            { id: true, text: "friends only", icon: "ph:users-bold" },
          ]}
        />
      </Show>

      {/* AC-112 — hidden entirely on the weekly XP board. */}
      <Show when={props.selection().type !== "weekly"}>
        <Group
          selected={{
            mode: props.selection().mode,
            mode2: props.selection().mode2,
          }}
          onSelect={selectMode}
          items={MODE_BUTTONS}
        />
      </Show>
    </>
  );
}

/** AC-109: one `bg-sub-alt` pill group, left-aligned buttons with a leading icon. */
function Group<T>(props: {
  items: GroupItem<T>[];
  selected: T | undefined;
  onSelect: (selected: T) => void;
}): JSXElement {
  const isEqual = (a: unknown, b: unknown): boolean =>
    typeof a === "object" ? JSON.stringify(a) === JSON.stringify(b) : a === b;

  return (
    <div class="mb-4 grid gap-4 rounded-xl bg-sub-alt p-4">
      <For each={props.items}>
        {(item) => (
          <Button
            onClick={() => props.onSelect(item.id)}
            icon={{ icon: item.icon }}
            text={item.text}
            class="justify-start px-[0.75em]"
            active={isEqual(item.id, props.selected)}
          />
        )}
      </For>
    </div>
  );
}

/**
 * Coerces a selection back onto the AC-114 matrix. The weekly board carries no
 * mode axis; the speed boards always land on a bundled `time 4` / `time 8`.
 */
export function normalizeSelection(draft: Selection): Selection {
  if (draft.type === "weekly") {
    return {
      type: "weekly",
      friendsOnly: draft.friendsOnly,
      previous: false,
    };
  }

  const validMode2 = VALID_LEADERBOARD_MATRIX[draft.type].time;
  const first = validMode2[0];

  const mode2 =
    draft.mode2 !== undefined && validMode2.includes(draft.mode2)
      ? draft.mode2
      : first;

  return { ...draft, mode: "time", mode2 };
}
