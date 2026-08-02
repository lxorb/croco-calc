import { publicContract } from "@croco-calc/contracts/public";
import { initServer } from "@ts-rest/express";
import * as PublicController from "../controllers/public";
import { callController } from "../ts-rest-adapter";

const s = initServer();
export default s.router(publicContract, {
  getScoreHistogram: {
    handler: async (r) => callController(PublicController.getScoreHistogram)(r),
  },
  getSiteStats: {
    handler: async (r) => callController(PublicController.getSiteStats)(r),
  },
});
