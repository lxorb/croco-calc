import { QueryClientProvider } from "@tanstack/solid-query";
import { JSXElement } from "solid-js";
import { render } from "solid-js/web";

import { queryClient } from "../queries";
import { qsa } from "../utils/dom";
import { Theme } from "./core/Theme";
import { DevTools } from "./dev/DevTools";
import { CommandlineHotkey } from "./hotkeys/CommandlineHotkey";
import { Footer } from "./layout/footer/Footer";
import { Header } from "./layout/header/Header";
import { Overlays } from "./layout/overlays/Overlays";
import { Modals } from "./modals/Modals";
import { NotFoundPage } from "./pages/404Page";
import { AboutPage } from "./pages/AboutPage";
import { AccountSettingsPage } from "./pages/account-settings/AccountSettingsPage";
import { AccountPage } from "./pages/account/AccountPage";
import { MyProfile } from "./pages/account/MyProfile";
import { FriendsPage } from "./pages/connections/FriendsPage";
import { LeaderboardPage } from "./pages/leaderboard/LeaderboardPage";
import { LoginPage } from "./pages/login/LoginPage";
import { ProfilePage } from "./pages/profile/ProfilePage";
import { ProfileSearchPage } from "./pages/profile/ProfileSearchPage";
import { AnswerSymbols } from "./pages/test/AnswerSymbols";
import { BarTimerProgress } from "./pages/test/live-stats/BarTimerProgress";
import { TaskReadouts } from "./pages/test/live-stats/TaskReadouts";
import { LoadingSpinner } from "./pages/test/LoadingSpinner";
import { TestModesNotice } from "./pages/test/modes-notice/TestModesNotice";
import { OutOfFocusWarning } from "./pages/test/OutOfFocusWarning";
import { StartGate } from "./pages/test/StartGate";
import { TestConfig } from "./pages/test/TestConfig";
import { RestartIcon } from "./pages/test/TestIcons";
import { Popups } from "./popups/Popups";

const components: Record<string, () => JSXElement> = {
  footer: () => <Footer />,
  aboutpage: () => <AboutPage />,
  accountpage: () => <AccountPage />,
  loginpage: () => <LoginPage />,
  leaderboardpage: () => <LeaderboardPage />,
  profilepage: () => <ProfilePage />,
  profilesearchpage: () => <ProfileSearchPage />,
  myprofile: () => <MyProfile />,
  modals: () => <Modals />,
  popups: () => <Popups />,
  overlays: () => <Overlays />,
  theme: () => <Theme />,
  header: () => <Header />,
  devtools: () => <DevTools />,
  testconfig: () => <TestConfig />,
  commandlinehotkey: () => <CommandlineHotkey />,
  testmodesnotice: () => <TestModesNotice />,
  friendspage: () => <FriendsPage />,
  notfoundpage: () => <NotFoundPage />,
  accountsettingspage: () => <AccountSettingsPage />,
  outoffocuswarning: () => <OutOfFocusWarning />,
  startgate: () => <StartGate />,
  answersymbols: () => <AnswerSymbols />,
  restarticon: () => <RestartIcon />,
  loadingspinner: () => <LoadingSpinner />,
  taskreadouts: () => <TaskReadouts />,
  bartimerprogress: () => <BarTimerProgress />,
};

function mountToMountpoint(name: string, component: () => JSXElement): void {
  for (const mountPoint of qsa(name)) {
    render(
      () => (
        <QueryClientProvider client={queryClient}>
          {component()}
        </QueryClientProvider>
      ),
      mountPoint.native,
    );
  }
}

export function mountComponents(): void {
  for (const [query, component] of Object.entries(components)) {
    mountToMountpoint(`mount[data-component=${query}]`, component);
  }
}
