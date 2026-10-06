// Ordinary earned Coins are a separate game balance from optional SPL payments.
export function commerceUI({ request, dialog, btn, element, notice, bridge, afterSale, openTokenShop, openTokenBuyer }) {
  const itemId = (item) => item.id ?? item.itemId;
  const name = (item) => item.name ?? itemId(item).replaceAll("-", " ");
  function operation(path) {
    let attempt;
    return async (payload) => {
      const signature = JSON.stringify(payload);
      if (attempt?.signature !== signature) attempt = { signature, id: crypto.randomUUID() };
      const result = await request(path, { ...payload, id: attempt.id });
      attempt = null;
      return result;
    };
  }
  function heading(d, catalog) {
    d.append(element("p", `${catalog.coins} Coins · earned game currency`),
      element("p", "Coins buy adventure equipment and supplies. No wallet or token payment is needed."));
  }
  async function shops() {
    const catalog = await request("/api/adventure/commerce"), d = dialog("Adventure shops · Coins");
    heading(d, catalog);
    d.append(element("p", "Visit the merchants west of Town to buy. Gathering and monster loot can be sold for Coins."));
    for (const vendor of catalog.shops)
      d.append(btn(vendor.name, () => { d.close(); return shop(vendor.id); }));
    if (bridge.scene.adventure?.roomId !== "town")
      d.append(btn("Travel to Town", () => { d.close(); bridge.join("town"); }));
  }
  async function shop(id) {
    const catalog = await request("/api/adventure/commerce"), vendor = catalog.shops.find((v) => v.id === id);
    if (!vendor) throw new Error("This adventure shop is unavailable.");
    const d = dialog(vendor.name + " · Coins");
    heading(d, catalog);
    d.append(element("p", "Stand near this merchant in Town to buy."));
    for (const item of vendor.items) {
      const quantity = element("input");
      quantity.type = "number"; quantity.min = 1; quantity.max = item.maxQuantity; quantity.value = 1;
      quantity.setAttribute("aria-label", name(item) + " purchase quantity");
      d.append(element("p", `${name(item)} · ${item.price} Coins each · level ${item.requiredLevel ?? 1} · owned ${item.owned}`), quantity);
      const buy = operation("/api/adventure/commerce/buy");
      d.append(btn("Buy " + name(item) + " for Coins", async () => {
        const count = Number(quantity.value);
        if (!Number.isInteger(count) || count < 1 || count > item.maxQuantity) throw new Error("Choose a valid purchase quantity.");
        const result = await buy({ vendor: id, itemId: itemId(item), quantity: count });
        notice(result.message);
        d.close();
        await shop(id);
      }));
    }
    if (catalog.buyers.some((buyer) => buyer.id === id))
      d.append(btn("Sell monster materials for Coins", () => { d.close(); return buyer(id); }));
    if (openTokenShop)
      d.append(btn("Optional $MOCHI token market", () => { d.close(); return openTokenShop(id); }));
  }
  async function buyer(id) {
    const catalog = await request("/api/adventure/commerce"), vendor = catalog.buyers.find((v) => v.id === id);
    if (!vendor) throw new Error("This resource buyer is unavailable.");
    const d = dialog(vendor.name + " · Coins"), selected = {};
    heading(d, catalog);
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
    const sell = operation("/api/adventure/commerce/sell");
    const complete = async (items) => {
      if (!Object.keys(items).length) throw new Error("Choose owned resources to sell.");
      const result = await sell({ vendor: id, items: { ...items } });
      notice(result.message);
      d.close();
      await afterSale?.();
      await buyer(id);
    };
    d.append(preview, btn("Sell selected for Coins", () => complete(selected)),
      btn("Sell all for Coins", () => complete(Object.fromEntries(owned.map((i) => [itemId(i), i.owned])))));
    if (openTokenBuyer && ["wood", "fish"].includes(id))
      d.append(btn("Optional $MOCHI token rewards", () => { d.close(); return openTokenBuyer(id); }));
    bridge.scene.audio.cue("vendor");
  }
  return { shops, shop, buyer };
}
