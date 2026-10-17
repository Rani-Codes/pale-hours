// Pick roles and start the match through the lobby panel, with real clicks:
// the killer page picks killer, every other page survivor, the host presses
// Start. Matches spawn at random, so unless randomSpawns is set the host then
// moves everyone to the old fixed layout the drivers were written against:
// the killer at (-10, 0) m, survivors in ID order east of (10, 0) m. Resolves
// with each guest's correction count at that point, because paleSim.load moves
// count as corrections and a driver checking for none must subtract them.
export async function startMatch(host, guests, { killer = host, randomSpawns = false } = {}) {
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
  if (randomSpawns) return Promise.all(guests.map((g) => g.evaluate(() => paleSession.stats().corrections)));
  await host.evaluate(() => {
    const s = paleSim.state();
    const at = [{ x: 10, y: 0 }, { x: 10, y: 4 }, { x: 10, y: -4 }, { x: 14, y: 0 }];
    let next = 0;
    for (const p of s.players.slice().sort((a, b) => a.id - b.id)) {
      const spot = p.role === paleSim.roles.killer ? { x: -10, y: 0 } : at[next++];
      Object.assign(p, { x: spot.x * 1e6, y: spot.y * 1e6, trail: undefined });
    }
    paleSim.load(s);
  });
  await host.waitForTimeout(1500);
  return Promise.all(guests.map((g) => g.evaluate(() => paleSession.stats().corrections)));
}
