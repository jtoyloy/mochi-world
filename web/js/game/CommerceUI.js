// Ordinary earned Coins are a separate game balance from optional SPL payments.
export function commerceUI({ request, dialog, btn, element, notice, bridge, afterSale, openTokenShop, openTokenBuyer, storage }) {
  try { storage ??= globalThis.sessionStorage; } catch { storage = null; }
  const itemId = (item) => item.id ?? item.itemId;
  const name = (item) => item.name ?? itemId(item).replaceAll("-", " ");
  const key = (owner) => "mochi:pending-commerce:" + owner;
  function pending(owner) {
    const raw = storage?.getItem(key(owner));
    if (!raw) return null;
    const receipt = JSON.parse(raw);
    if (receipt.owner !== owner || receipt.payload?.expectedOwner !== owner || !["/api/adventure/commerce/buy", "/api/adventure/commerce/sell"].includes(receipt.path)
      || typeof receipt.payload?.id !== "string" || typeof receipt.payload?.vendor !== "string")
      throw new Error("Saved commerce receipt is invalid. Do not repeat the purchase; contact support.");
    return receipt;
  }
  function ownerOf(catalog) {
    if (typeof catalog.userId !== "string" || !catalog.userId)
      throw new Error("Your account could not be verified for commerce.");
    return catalog.userId;
  }
  function clear(receipt) {
    if (pending(receipt.owner)?.payload.id === receipt.payload.id)
      storage.removeItem(key(receipt.owner));
  }
  async function dispatch(receipt) {
    // A stale panel must never replay another account's receipt after sign-in changes.
    const current = await request("/api/adventure/commerce");
    if (ownerOf(current) !== receipt.owner)
      throw new Error("This receipt belongs to another account. Open the shop again after signing in.");
    try {
      const result = await request(receipt.path, receipt.payload);
      clear(receipt);
      return result;
    } catch (error) {
      // Network errors, timeouts and server failures may follow a committed trade.
      if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500
        && ![401, 408, 429].includes(error.status)) clear(receipt);
      throw error;
    }
  }
  function operation(path, owner) {
    return async (payload) => {
      payload = { ...payload, expectedOwner: owner };
      const saved = pending(owner);
      if (saved) {
        const { id, ...original } = saved.payload;
        if (saved.path !== path || JSON.stringify(original) !== JSON.stringify(payload))
          throw new Error("Resolve your pending Coins transaction before starting another.");
        return dispatch(saved);
      }
      const receipt = { owner, path, payload: { ...payload, id: crypto.randomUUID() } };
      if (!storage) throw new Error("Browser storage is unavailable. Coins checkout cannot safely begin.");
      storage.setItem(key(owner), JSON.stringify(receipt));
      return dispatch(receipt);
    };
  }
  function recovery(d, catalog, reopen) {
    const saved = pending(ownerOf(catalog));
    if (!saved) return false;
    d.append(element("p", "A Coins transaction has an unresolved response. Retry its saved receipt before buying or selling again."),
      element("p", `Receipt ${saved.payload.id} · ${saved.path.endsWith("/buy") ? "purchase" : "sale"} · ${saved.payload.vendor}`),
      btn("Retry saved Coins transaction", async () => {
        const result = await dispatch(saved);
        notice(result.message);
        d.close();
        if (saved.path.endsWith("/sell")) await afterSale?.();
        await reopen();
      }));
    return true;
  }
  function heading(d, catalog) {
    d.append(element("p", `${catalog.coins} Coins · earned game currency`),
      element("p", "Coins buy adventure equipment and supplies. No wallet or token payment is needed."));
  }
  async function shops(invoker = globalThis.document?.activeElement) {
    const catalog = await request("/api/adventure/commerce"), d = dialog("Adventure shops · Coins", invoker);
    heading(d, catalog);
    if (recovery(d, catalog, () => shops(invoker))) return;
    d.append(element("p", "Visit the merchants west of Town to buy. Gathering and monster loot can be sold for Coins."));
    for (const vendor of catalog.shops)
      d.append(btn(vendor.name, () => { d.close(); return shop(vendor.id, invoker); }));
    if (bridge.scene.adventure?.roomId !== "town")
      d.append(btn("Travel to Town", () => { d.close(); bridge.join("town"); }));
  }
  async function shop(id, invoker = globalThis.document?.activeElement) {
    const catalog = await request("/api/adventure/commerce"), vendor = catalog.shops.find((v) => v.id === id);
    if (!vendor) throw new Error("This adventure shop is unavailable.");
    const d = dialog(vendor.name + " · Coins", invoker);
    heading(d, catalog);
    if (recovery(d, catalog, () => shop(id, invoker))) return;
    d.append(element("p", "Stand near this merchant in Town to buy."));
    for (const item of vendor.items) {
      const quantity = element("input");
      quantity.type = "number"; quantity.min = 1; quantity.max = item.maxQuantity; quantity.value = 1;
      quantity.setAttribute("aria-label", name(item) + " purchase quantity");
      d.append(element("p", `${name(item)} · ${item.price} Coins each · level ${item.requiredLevel ?? 1} · owned ${item.owned}`), quantity);
      const buy = operation("/api/adventure/commerce/buy", ownerOf(catalog));
      d.append(btn("Buy " + name(item) + " for Coins", async () => {
        const count = Number(quantity.value);
        if (!Number.isInteger(count) || count < 1 || count > item.maxQuantity) throw new Error("Choose a valid purchase quantity.");
        const result = await buy({ vendor: id, itemId: itemId(item), quantity: count });
        notice(result.message);
        d.close();
        await shop(id, invoker);
      }));
    }
    if (catalog.buyers.some((buyer) => buyer.id === id))
      d.append(btn("Sell monster materials for Coins", () => { d.close(); return buyer(id, invoker); }));
    if (openTokenShop)
      d.append(btn("Optional $MOCHI token market", () => { d.close(); return openTokenShop(id, invoker); }));
  }
  async function buyer(id, invoker = globalThis.document?.activeElement) {
    const catalog = await request("/api/adventure/commerce"), vendor = catalog.buyers.find((v) => v.id === id);
    if (!vendor) throw new Error("This resource buyer is unavailable.");
    const d = dialog(vendor.name + " · Coins", invoker), selected = {};
    heading(d, catalog);
    if (recovery(d, catalog, () => buyer(id, invoker))) return;
    d.append(element("p", "Stand near the buyer in Town to sell. Choose Coins for wallet-free adventure upgrades."));
    const preview = element("p", "Choose resources to sell");
    const estimate = () => preview.textContent = "Sale value: " + vendor.items.reduce((total, item) => total + item.price * (selected[itemId(item)] ?? 0), 0) + " Coins";
    const owned = vendor.items.filter((item) => item.owned > 0);
    if (!owned.length) d.append(element("p", "No accepted resources in your bag yet. Gather wood or fish, or collect monster loot."));
    for (const item of owned) {
      const field = element("input");
      field.type = "number"; field.min = 0; field.max = item.owned; field.value = 0;
      field.setAttribute("aria-label", name(item) + " sale quantity");
      field.oninput = () => {
        const count = Number(field.value);
        if (Number.isInteger(count) && count > 0 && count <= item.owned) selected[itemId(item)] = count;
        else delete selected[itemId(item)];
        estimate();
      };
      d.append(element("p", `${name(item)} ×${item.owned} · ${item.price} Coins each`), field);
    }
    const sell = operation("/api/adventure/commerce/sell", ownerOf(catalog));
    const complete = async (items) => {
      if (!Object.keys(items).length) throw new Error("Choose owned resources to sell.");
      const result = await sell({ vendor: id, items: { ...items } });
      notice(result.message);
      d.close();
      await afterSale?.();
      await buyer(id, invoker);
    };
    d.append(preview, btn("Sell selected for Coins", () => complete(selected)),
      btn("Sell all for Coins", () => complete(Object.fromEntries(owned.map((i) => [itemId(i), i.owned])))));
    if (openTokenBuyer && ["wood", "fish"].includes(id))
      d.append(btn("Optional $MOCHI token rewards", () => { d.close(); return openTokenBuyer(id, invoker); }));
    bridge.scene.audio.cue("vendor");
  }
  return { shops, shop, buyer };
}
