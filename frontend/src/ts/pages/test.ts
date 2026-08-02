import Page from "./page";
import { blurInputElement } from "../input/input-element";
import { resetIncompleteTests } from "../states/test";
import * as TestLogic from "../test/test-logic";
import { qsr } from "../utils/dom";

export const page = new Page({
  id: "test",
  element: qsr(".page.pageTest"),
  path: "/",
  beforeHide: async (): Promise<void> => {
    blurInputElement();
  },
  afterHide: async (): Promise<void> => {
    // CP-052 — leaving the page abandons the run and re-hides the stream.
    TestLogic.restart();
  },
  beforeShow: async (): Promise<void> => {
    resetIncompleteTests();
    TestLogic.restart();
  },
});
