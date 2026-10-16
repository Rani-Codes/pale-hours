// Pick roles and start the match through the lobby panel, with real clicks:
// the killer page picks killer, every other page survivor, the host presses
// Start. Resolves once every tab is in the match and the host has run a
// second of ticks.
export async function startMatch(host, guests, { killer = host } = {}) {
  const pages = [host, ...guests];
  await host.waitForFunction((n) => globalThis.paleSession?.room?.().seats.length === n, pages.length, { timeout: 15000 });
  for (const page of pages) {
    await page.waitForFunction(() => globalThis.paleSession?.room?.().you > 0, null, { timeout: 15000 });
    await page.click(page === killer ? "#pick-killer" : "#pick-survivor");
  }
  await host.waitForFunction(() => !paleSession.room().problem, null, { timeout: 10000 });
  await host.click("#start");
  for (const page of pages) await page.waitForFunction(() => paleSession.room().started, null, { timeout: 10000 });
  await host.waitForFunction(() => paleSim.state().tick > 30);
}
