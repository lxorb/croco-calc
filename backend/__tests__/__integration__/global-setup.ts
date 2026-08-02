import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";

let startedMongoContainer: StartedTestContainer | undefined;

export async function setup(): Promise<void> {
  process.env.TZ = "UTC";

  //use testcontainer to start mongodb
  console.log("\x1b[36mMongoDB starting...\x1b[0m");
  const mongoContainer = new GenericContainer("mongo:5.0.13")
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forListeningPorts());

  startedMongoContainer = await mongoContainer.start();

  const mongoUrl = `mongodb://${startedMongoContainer?.getHost()}:${startedMongoContainer?.getMappedPort(
    27017,
  )}`;
  process.env["TEST_DB_URL"] = mongoUrl;
  console.log(`\x1b[32mMongoDB is running on ${mongoUrl}\x1b[0m`);
}

async function stopContainers(): Promise<void> {
  console.log("\x1b[36mMongoDB stopping...\x1b[0m");
  await startedMongoContainer?.stop();
  console.log(`\x1b[32mContainers stopped.\x1b[0m`);
}

export async function teardown(): Promise<void> {
  await stopContainers();
}

process.on("SIGTERM", stopContainers);
process.on("SIGINT", stopContainers);
