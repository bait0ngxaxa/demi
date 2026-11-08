// Imported only by the isolated browser-test copy, never by production source.
await window.__liffEvent("module:start", location.pathname + location.search);
await fetch("/__line_sdk/module");
const sdk = {
  id: null,
  isInClient: () => true,
  isLoggedIn: () => true,
  getContext: () => ({ viewType: "full" }),
  getIDToken: () => null,
  getAccessToken: () => null,
  async init({ liffId }) {
    sdk.id = liffId;
    await window.__liffEvent("init:start", location.pathname + location.search, liffId);
    const response = await fetch("/__line_sdk/init");
    if (!response.ok) throw new Error("Synthetic provider failure");
    const state = new URLSearchParams(location.search).get("liff.state");
    if (state && liffId.endsWith("-Workspace")) {
      const target = new URL(state, location.origin);
      target.searchParams.set("liff.hback", "2");
      target.searchParams.set("lineAppVersion", "14.19.1");
      await window.__liffEvent("sdk:secondary", target.pathname + target.search, liffId);
      location.replace(target);
      await new Promise(() => {});
    }
    await window.__liffEvent("init:resolved", location.pathname + location.search, liffId);
  },
};
export default sdk;
