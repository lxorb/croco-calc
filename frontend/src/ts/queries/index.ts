import { QueryClient } from "@tanstack/solid-query";
import { createEffectOn } from "../hooks/effects";
import { isAuthenticated } from "../states/core";

export const queryClient = new QueryClient();

createEffectOn(isAuthenticated, () => {
  //reset user related queries and collections whenever the state changes.
  //some user-bound collections initialize before a user is present, so reset on
  //every state change and not just on logout, or they stay empty after login.
  void queryClient.resetQueries({ queryKey: ["user"] });
});
