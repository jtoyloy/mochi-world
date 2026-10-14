import { mountWorld } from "../game/Game.js";
import { accountGate } from "./account.js";
import { accountRecovery } from "./account-recovery.js";
import { lifeToBlob } from "../storage.js";
import { tokenCheckout, walletPage, treasuryPage } from "../game/ui/TokenUI.js";
import { ITEMS, SHOPS, LOCATIONS, DAILY_ACTIVITIES } from "./catalog.js";
import { portfolioValue } from "../traders/trading.js";
const app = document.querySelector("#app"),
  byId = new Map(ITEMS.map((x) => [x.id, x]));
let world,
  config,
  currentCleanup = null,
  accountGateVisible = false,
  routeSerial = Promise.resolve(),
  toastTimer;
const money = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
const currencyLabel = () => (world?.currency?.mock ? "TEST $MOCHI" : "$MOCHI");
if (new URLSearchParams(location.search).has("panel"))
  document.body.classList.add("embedded-panel");
const petPath = (p) => "/mochi/" + encodeURIComponent(p.id);
const userPath = (u) => "/user/" + encodeURIComponent(u.username);
function node(tag, text = "", cls = "") {
  const x = document.createElement(tag);
  if (text !== null) x.textContent = text;
  if (cls) x.className = cls;
  return x;
}
function append(parent, ...children) {
  parent.append(...children.filter(Boolean));
  return parent;
}
const link = (text, path, cls = "") => {
  const x = node("a", text, cls);
  x.href = path;
  return x;
};
const button = (text, fn, cls = "") => {
  const x = node("button", text, cls);
  if (text === "Equip" && !world?.activeMochi) {
    x.disabled = true;
    x.title = "Adopt a Mochi first";
  }
  x.onclick = async () => {
    x.disabled = true;
    try {
      await fn();
    } catch (e) {
      delete x.dataset.keepDisabled;
      notice(e.message);
    } finally {
      if (!x.dataset.keepDisabled) x.disabled = false;
    }
  };
  return x;
};
const card = (...c) => append(node("article", "", "card"), ...c);
const grid = (...c) => append(node("div", "", "grid"), ...c);
const section = (title, extra) =>
  append(node("div", "", "section-label"), node("h2", title), extra);
async function api(path, data) {
  const r = await fetch(
    path,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {},
  );
  const b = await r.json();
  if (!r.ok) {
    const error = new Error(b.error ?? "Unable to open this page");
    error.status = r.status;
    if (r.status === 401) window.dispatchEvent(new Event("mochi:session-expired"));
    throw error;
  }
  return b;
}
function notice(text) {
  const x = document.querySelector("#toast");
  x.textContent = text;
  x.className = "toast";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    x.className = "";
    x.textContent = "";
  }, 5000);
}
async function action(path, data) {
  if (["/api/buy", "/api/listings/buy"].includes(path)) {
    await tokenCheckout(data);
    await refresh();
    return { message: "Checkout opened" };
  }
  const answer = await api(path, data);
  notice(answer.message ?? "Done");
  await refresh();
  return answer;
}
async function refresh() {
  world = await api("/api/world");
  document.querySelector("#coins").textContent =
    world.currency.formatted +
    (world.currency.mock ? " TEST $MOCHI" : " $MOCHI");
  const unread = world.events.filter((x) => !x.read_at).length;
  document.querySelector("#notifications").textContent = "♧ " + unread;
  document.querySelector("#profileLink").textContent = world.user.displayName;
  document.querySelector("#profileLink").href = userPath(world.user);
  document
    .querySelector("#profileLink")
    .setAttribute("aria-label", world.user.displayName + " profile");
  const navPet = [...document.querySelectorAll("#navigation a")].find(
    (x) => x.textContent === "My Mochi",
  );
  if (navPet)
    navPet.href = world.activeMochi ? petPath(world.activeMochi) : "/home";
}
function head(title, subtitle, cta) {
  return append(
    node("div", "", "page-head"),
    append(
      node("div"),
      node("div", "YOUR LITTLE WORLD", "eyebrow"),
      node("h1", title),
      node("p", subtitle, "muted"),
    ),
    cta,
  );
}
function tabs(links) {
  return append(
    node("nav", "", "tabs"),
    ...links.map(([text, path]) =>
      link(
        text,
        path,
        location.pathname === path ||
          path === "/items/" + location.pathname.slice(1)
          ? "active"
          : "",
      ),
    ),
  );
}
function blank(text) {
  return node("p", text, "empty");
}
function tags(values) {
  return append(node("div"), ...values.map((x) => node("span", x, "pill")));
}
function portrait(p) {
  const x = node("div", "", "pet-portrait"),
    mochi = node("div", "", "mochi-art");
  append(mochi, node("span", "", "smile"), node("span", "", "blush"));
  append(x, node("span", "✦", "spark"), mochi);
  for (const [slot, id] of Object.entries(p.equipped ?? {})) {
    const item = byId.get(id);
    if (item) append(x, node("span", item.icon, "wear " + slot));
  }
  return x;
}
function needs(p) {
  const x = node("div", "", "needs");
  for (const name of ["Happiness", "Fullness", "Energy"]) {
    const val = p.stats[name],
      n = node("div", "", "need"),
      label = append(
        node("label"),
        node("span", name),
        node("span", `${val}/100`),
      ),
      bar = node("progress");
    bar.max = 100;
    bar.value = val;
    bar.setAttribute("aria-label", name);
    append(n, label, bar);
    x.append(n);
  }
  return x;
}
function modal(title, body) {
  const d = node("dialog");
  append(
    d,
    node("h2", title),
    body,
    button("Close", () => d.close(), "secondary"),
  );
  document.body.append(d);
  d.onclose = () => d.remove();
  d.showModal();
  return d;
}
function form(fields, submitText, fn) {
  const f = node("form");
  for (const field of fields) {
    const label = node("label", field.label),
      input = node(field.options ? "select" : "input");
    input.name = field.name;
    input.type = field.type ?? "text";
    input.required = field.required !== false;
    if (field.options)
      for (const [v, t] of field.options) {
        const o = node("option", t);
        o.value = v;
        input.append(o);
      }
    if (field.value !== undefined) input.value = field.value;
    if (field.min !== undefined) input.min = field.min;
    if (field.max !== undefined) input.max = field.max;
    append(label, input);
    f.append(label);
  }
  const b = node("button", submitText);
  b.type = "submit";
  f.append(b);
  f.onsubmit = async (e) => {
    e.preventDefault();
    b.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(f));
      for (const x of fields)
        if (x.type === "number") data[x.name] = Number(data[x.name]);
      await fn(data);
      f.closest("dialog")?.close();
    } catch (e) {
      notice(e.message);
    } finally {
      b.disabled = false;
    }
  };
  return f;
}
async function care(kind, itemId, mochiId = world.activeMochi?.id) {
  if (!mochiId) return notice("Adopt a Mochi first, then share a little care.");
  await action("/api/care", { mochiId, kind, itemId });
  await render();
}
function carePicker(kind, mochiId = world.activeMochi?.id) {
  const items = world.inventory.filter(
    (x) =>
      x.location === "bag" &&
      x.item.category === (kind === "feed" ? "food" : "toy"),
  );
  const host = node("div", "", "stack");
  for (const row of items)
    host.append(
      button(
        `${row.item.icon} ${row.item.name} ×${row.quantity}`,
        async () => {
          await care(kind, row.item.id, mochiId);
          host.closest("dialog").close();
        },
        "secondary",
      ),
    );
  if (!items.length)
    host.append(
      blank("Your bag is empty. A shopkeeper at Market Row can help."),
      link("Visit Market Row", "/explore/market", "button"),
    );
  modal(kind === "feed" ? "A little treat?" : "Let’s play", host);
}
function petCard(p, full = false) {
  const owned = p.owner.username === world.user.username;
  const body = node("div");
  append(
    body,
    tags([
      p.profile.variant ?? "Aurora Mochi",
      "Level " + p.profile.level,
      p.mood,
    ]),
    node("h2", p.name),
    node(
      "p",
      owned
        ? "Your curious little companion. One day at a time."
        : `A little companion of ${p.owner.displayName}.`,
      "muted",
    ),
    needs(p),
  );
  if (owned)
    append(
      body,
      append(
        node("div", "", "actions"),
        button("🍡 Feed", () => carePicker("feed", p.id), "secondary small"),
        button("🧸 Play", () => carePicker("play", p.id), "secondary small"),
        button("♡ Pet", () => care("pet", undefined, p.id), "secondary small"),
        button(
          "☾ Rest",
          () => care("sleep", undefined, p.id),
          "secondary small",
        ),
      ),
    );
  append(
    body,
    append(
      node("div", "", "actions"),
      link(
        owned ? "Visit their home" : "View profile",
        owned ? petPath(p) + "/home" : petPath(p),
        "button small",
      ),
      owned
        ? button(
            "Dress up",
            async () => {
              await action("/api/active", { mochiId: p.id });
              await navigate("/items/closet");
            },
            "secondary small",
          )
        : null,
    ),
  );
  return append(node("article", "", "pet-card"), portrait(p), body);
}
function events(rows = world.events, limit = 5) {
  const x = node("div");
  for (const e of rows.slice(0, limit))
    append(
      x,
      append(
        node("div", "", "event"),
        node("span", e.payload.message ?? e.type),
        node("small", new Date(e.created_at).toLocaleString()),
      ),
    );
  if (!rows.length)
    x.append(blank("A fresh page in your story. Adventures will appear here."));
  return x;
}
function dailyCard() {
  const host = card(
    node("h2", "Little daily rituals"),
    node("p", "A small reason to stop by, every day.", "muted"),
  );
  for (const d of DAILY_ACTIVITIES) {
    const claimed = world.claims.some((x) => x.activity === d.id);
    const b = button(
      claimed ? "✓ Claimed" : "Claim",
      async () => {
        await action("/api/daily", { activity: d.id });
        await render();
      },
      "secondary small",
    );
    b.disabled = claimed;
    append(
      host,
      append(
        node("div", "", "daily"),
        append(node("div"), node("b", d.name), node("p", d.description)),
        b,
      ),
    );
  }
  return host;
}
async function home() {
  append(
    app,
    head(
      `Welcome home, ${world.user.displayName}.`,
      "A little care. A little curiosity. A whole city to explore.",
    ),
  );
  const banner = append(
    node("div", "", "hero"),
    node("div", "THE CITY IS OPEN", "eyebrow"),
    node("h2", "Your next adventure is around the corner."),
    node(
      "p",
      "Market stalls are restocking. Berries are waiting at the arcade. And someone small is happy to see you.",
    ),
    node("span", "✦", "orb"),
    link("Explore Mochi City →", "/explore", "button small"),
  );
  app.append(banner);
  if (!world.activeMochi) {
    app.append(card(node("h2", "Meet your first Mochi"), adoptForm()));
    return;
  }
  const left = node("div"),
    right = node("div", "", "stack"),
    layout = node("div", "", "home-layout");
  left.append(petCard(world.activeMochi));
  append(
    left,
    section("Around the city", link("See the map →", "/explore")),
    grid(...LOCATIONS.slice(0, 3).map((l) => destination(l))),
  );
  const p = world.activeMochi.portfolio;
  append(
    right,
    dailyCard(),
    card(
      node("div", "A LITTLE PAPER EXPERIMENT", "eyebrow"),
      node("h3", `${world.activeMochi.name}’s portfolio`),
      node("div", money(portfolioValue(p)), "metric"),
      node(
        "p",
        `${((portfolioValue(p) / p.startingBalance - 1) * 100).toFixed(2)}% simulated return · Cadence makes every decision.`,
        "muted",
      ),
      link("Trading Floor →", "/explore/trading"),
    ),
    card(
      section("Your story", link("All activity", "/community/events")),
      events(),
    ),
  );
  append(layout, left, right);
  app.append(layout);
}
function adoptForm() {
  return form(
    [{ name: "name", label: "Mochi name", value: "Mochi" }],
    "Adopt a Mochi",
    async (data) => {
      await action("/api/adopt", data);
      await render();
    },
  );
}
function destination(l) {
  return card(
    node("div", l.icon, "icon"),
    node("h3", l.name),
    node("p", l.description, "muted"),
    link("Take a look →", l.path, "button secondary small"),
  );
}
async function explore() {
  append(
    app,
    head(
      "Mochi City",
      "Pick a place. Follow your curiosity.",
      link("Your home", "/home", "button secondary"),
    ),
  );
  const map = node("div", "", "map");
  append(
    map,
    node("h2", "Mochi City", "map-title"),
    node("span", "A world made for small adventures.", "map-caption"),
  );
  const positions = [
      [9, 18],
      [62, 17],
      [7, 53],
      [64, 45],
      [36, 69],
      [33, 16],
      [76, 75],
    ],
    colors = [
      "#e6a48a",
      "#b6add9",
      "#a6ca93",
      "#a8bfce",
      "#c7afd3",
      "#e5ca89",
      "#aecad4",
    ];
  LOCATIONS.forEach((l, i) => {
    const a = link("", l.path, "building");
    a.style.left = positions[i][0] + "%";
    a.style.top = positions[i][1] + "%";
    a.style.setProperty("--building", colors[i]);
    a.style.setProperty("--roof", colors[i]);
    append(
      a,
      node("div", l.icon, "building-art"),
      node("span", l.name, "building-label"),
      node("small", l.description.split(".")[0]),
    );
    map.append(a);
  });
  [
    [4, 12],
    [24, 47],
    [84, 42],
    [10, 84],
    [57, 91],
    [88, 12],
    [35, 3],
  ].forEach(([x, y]) => {
    const t = node("span", "🌳", "tree");
    t.style.left = x + "%";
    t.style.top = y + "%";
    map.append(t);
  });
  app.append(
    map,
    section("Every corner has a little story"),
    grid(...LOCATIONS.map(destination)),
  );
}
async function profile(id) {
  const p = await api("/api/pet/" + encodeURIComponent(id));
  append(
    app,
    head(
      p.name,
      `${p.profile.species ?? "Mochi"} · ${p.profile.color ?? "Aurora"} · Cared for by ${p.owner.displayName}`,
      link("Meet their explorer", userPath(p.owner), "button secondary"),
    ),
  );
  app.append(petCard(p, true));
  const meta = node("div", "", "profile-meta");
  for (const [value, label] of [
    [`${p.ageDays} days`, "AGE"],
    [p.profile.level, "LEVEL"],
    [p.mood, "MOOD"],
    [p.tradingStyle, "TRADING STYLE"],
  ])
    append(
      meta,
      append(node("div"), node("b", String(value)), node("small", label)),
    );
  app.append(
    meta,
    card(
      node("h3", "Their paper-trading story"),
      node(
        "p",
        `${((portfolioValue(p.portfolio) / p.portfolio.startingBalance - 1) * 100).toFixed(2)}% lifetime return · ${p.trades.length} actual trades`,
      ),
      node(
        "small",
        "Adopted " + new Date(p.profile.adoptedAt).toLocaleDateString(),
      ),
      tags(Object.values(p.equipped).map((id) => byId.get(id)?.name ?? id)),
    ),
  );
  const combat=p.battle;
  if(combat){const favorite=Object.entries(combat.actions).sort((a,b)=>b[1]-a[1])[0];app.append(card(node('h3','Their battle story'),node('p',`${combat.decisions} decisions · ${combat.wins} victories · ${combat.damage} damage · ${combat.protection} damage prevented`),node('p',`Most used action: ${favorite?.[0]?.replaceAll('_',' ')??'still discovering'}. This describes observed choices, not a fixed class.`)));}
  if (p.relationships?.length)
    app.append(
      section("Familiar Mochis"),
      tags(
        p.relationships.map(
          (r) =>
            r.name + " · familiarity " + r.familiarity + " · trust " + r.trust,
        ),
      ),
    );
  const social = await api("/api/user/" + p.owner.username);
  app.append(
    section("Achievements"),
    social.achievements.length
      ? tags(social.achievements.map((x) => x.name))
      : blank("Their first achievements are still ahead."),
    section("Friends in the city"),
    social.friends.length
      ? tags(social.friends.map((x) => x.display_name))
      : blank("No explorer friendships yet."),
  );
  const fave = card(
    node("h2", "Little favorites"),
    node(
      "p",
      p.favorites.food
        ? `Favorite food: ${p.favorites.food}`
        : "Favorite food: Still discovering",
    ),
    node(
      "p",
      p.favorites.toy
        ? `Favorite toy: ${p.favorites.toy}`
        : "Favorite toy: Still discovering",
    ),
    node(
      "p",
      p.favorites.location
        ? `Favorite place: ${p.favorites.location}`
        : "Favorite place: Still exploring",
    ),
    node("small", "Favorites emerge after at least three shared moments."),
  );
  append(
    app,
    append(
      grid(
        fave,
        card(
          node("h2", "Personality"),
          tags(p.personality),
          node(
            "p",
            "Traits evolve gently through repeated care and play.",
            "muted",
          ),
        ),
        card(
          node("h2", "Trophy shelf"),
          p.trophies.length
            ? tags(p.trophies.map((x) => x.name))
            : blank("Room for future achievements."),
        ),
      ),
    ),
  );
  if (p.owner.username === world.user.username)
    append(
      app,
      section(
        "Your Mochis",
        button(
          "Adopt another",
          () => modal("A new little companion", adoptForm()),
          "secondary small",
        ),
      ),
      grid(
        ...world.mochis.map((m) =>
          card(
            link(m.name, petPath(m)),
            link("Visit home", petPath(m) + "/home", "button secondary small"),
            button(
              "Make active",
              async () => {
                await action("/api/active", { mochiId: m.id });
                await render();
              },
              "secondary small",
            ),
          ),
        ),
      ),
    );
}
async function userProfile(username) {
  const u = await api("/api/user/" + encodeURIComponent(username));
  append(
    app,
    head(
      u.displayName,
      `@${u.username} · Exploring since ${new Date(u.createdAt).toLocaleDateString()}`,
      link(
        "Visit their shop",
        "/shop/" + encodeURIComponent(username),
        "button secondary",
      ),
    ),
  );
  const avatarPreview = node("div", "", "profile-penguin");
  avatarPreview.setAttribute("role", "img");
  avatarPreview.setAttribute(
    "aria-label",
    (u.avatar?.display_name ?? u.displayName) + " penguin appearance",
  );
  avatarPreview.style.backgroundColor = u.avatar?.body_color ?? "#659db1";
  for (const part of ["belly", "eyes", "beak", "feet"])
    avatarPreview.append(node("span", "", part));
  const c = card(
    avatarPreview,
    tags(
      Object.values(u.avatar?.equipment ?? {}).map(
        (id) => byId.get(id)?.name ?? id,
      ),
    ),
    node("h2", "An explorer’s little corner"),
    node(
      "p",
      `${u.collectionCount} discoveries · ${u.friends.length} friends · ${u.trophies.length} trophies`,
    ),
  );
  if (username !== world.user.username)
    c.append(
      button(
        "♡ Send friend request",
        () => action("/api/friends/request", { username }),
        "secondary",
      ),
    );
  app.append(
    c,
    section("Mochis"),
    grid(
      ...u.pets.map((m) =>
        card(
          portrait({ equipped: {} }),
          node("h3", m.name),
          link("Meet " + m.name, petPath(m), "button secondary small"),
        ),
      ),
    ),
    section("Achievements"),
    u.achievements.length
      ? tags(u.achievements.map((x) => x.name))
      : blank("Their story is just beginning."),
    section("Trophies"),
    u.trophies.length
      ? tags(u.trophies.map((x) => x.name))
      : blank("Adventures will fill this shelf."),
    section("Competition record"),
    u.competitionRecord.length
      ? table(
          ["Cup", "Rank", "test rewards"],
          u.competitionRecord.map((x) => [x.name, x.rank, x.reward]),
        )
      : blank("No finished competitions yet."),
    section("Friends"),
    u.friends.length
      ? grid(...u.friends.map((f) => card(link(f.display_name, userPath(f)))))
      : blank("A hello could start a friendship."),
    section("Guild"),
    link("Guild Hall · Coming Soon", "/community/guilds", "button secondary"),
  );
}
function itemTabs() {
  return tabs([
    ["Inventory", "/items/inventory"],
    ["Storage", "/items/storage"],
    ["Closet", "/items/closet"],
    ["Mochipedia", "/items/collection"],
    ["Market Row", "/explore/market"],
  ]);
}
function itemCard(item, quantity, extra, locked = false) {
  const x = card(
    append(node("div", locked ? "?" : item.icon, "item-icon")),
    tags([item.rarity, item.category.replace("_", " ")]),
    node("h3", item.name),
    node("p", item.description, "muted"),
    quantity !== null ? node("small", `Owned: ${quantity}`) : null,
    extra,
  );
  x.classList.add("item-card");
  if (locked) x.classList.add("collection-locked");
  return x;
}
async function inventory(storage = false) {
  append(
    app,
    head(
      storage ? "A place for keepsakes." : "Your little bag.",
      storage
        ? "Put treasures away for later."
        : "Treats, toys, and things that make the world yours.",
      link(
        "Open your shop",
        "/shop/" + world.user.username,
        "button secondary",
      ),
    ),
    itemTabs(),
  );
  const rows = world.inventory.filter(
    (x) => x.location === (storage ? "storage" : "bag"),
  );
  if (!rows.length)
    return app.append(
      blank("Nothing here yet. Find a little treasure at Market Row."),
    );
  const filters = node("div", "", "tabs"),
    g = grid();
  for (const category of ["all", ...new Set(rows.map((x) => x.item.category))])
    filters.append(
      button(
        category === "all" ? "All items" : category.replace("_", " "),
        () => {
          for (const child of g.children)
            child.hidden =
              category !== "all" && child.dataset.category !== category;
        },
        "secondary small",
      ),
    );
  app.append(filters);
  for (const row of rows) {
    const i = row.item,
      actions = node("div", "", "actions");
    if (!storage) {
      if (i.category === "food")
        actions.append(button("Feed", () => care("feed", i.id), "small"));
      if (i.category === "toy")
        actions.append(button("Play", () => care("play", i.id), "small"));
      if (i.slot || i.furnitureSlot || i.category === "toy")
        actions.append(
          button(
            "Equip",
            async () => {
              await action("/api/equip", {
                mochiId: world.activeMochi.id,
                itemId: i.id,
              });
              await render();
            },
            "small",
          ),
        );
      if (i.tradable)
        actions.append(
          button("List", () => listingModal(i), "secondary small"),
          button("Gift", () => giftModal(i), "secondary small"),
        );
    }
    actions.append(
      button(
        storage ? "Take out" : "Store",
        async () => {
          await action("/api/inventory/move", {
            itemId: i.id,
            quantity: 1,
            to: storage ? "bag" : "storage",
          });
          await render();
        },
        "secondary small",
      ),
    );
    const c = itemCard(i, row.quantity, actions);
    c.dataset.category = i.category;
    g.append(c);
  }
  app.append(g);
}
function listingModal(i) {
  modal(
    "Give a treasure a new home",
    form(
      [
        {
          name: "quantity",
          label: "Quantity",
          type: "number",
          min: 1,
          max: 100,
          value: 1,
        },
        {
          name: "price",
          label: "Price per item · token units",
          type: "number",
          min: 1,
          max: 100000,
          value: i.baseValue,
        },
        {
          name: "title",
          label: "Shop title",
          value: world.user.displayName + "’s little shop",
        },
      ],
      "List item",
      async (data) => {
        await action("/api/listings/create", { ...data, itemId: i.id });
        await render();
      },
    ),
  );
}
function giftModal(i) {
  if (!world.friends.friends.length)
    return notice("Accept a friend request before sending a gift.");
  modal(
    "A little gift for a friend",
    form(
      [
        {
          name: "username",
          label: "Friend",
          options: world.friends.friends.map((x) => [
            x.username,
            x.display_name,
          ]),
        },
        {
          name: "quantity",
          label: "Quantity",
          type: "number",
          min: 1,
          max: 50,
          value: 1,
        },
      ],
      "Send gift",
      async (data) => {
        await action("/api/gift", { ...data, itemId: i.id });
        await render();
      },
    ),
  );
}
async function closet() {
  const p = world.activeMochi;
  append(
    app,
    head("A look of their own.", "A favorite outfit and a cozy place to rest."),
    itemTabs(),
  );
  if (!p) return app.append(blank("Adopt a Mochi first."));
  const wardrobe = card(
    node("h2", "Today’s look"),
    portrait(p),
    tags(Object.values(p.equipped).map((id) => byId.get(id)?.name ?? id)),
  );
  for (const [slot, id] of Object.entries(p.equipped))
    wardrobe.append(
      button(
        "Remove " + slot,
        async () => {
          await action("/api/equip", { mochiId: p.id, slot, remove: true });
          await render();
        },
        "secondary small",
      ),
    );
  const room = card(
    node("h2", "A cozy little home"),
    node("p", "Bed · Plant · Rug · Computer · Toy", "muted"),
  );
  for (const slot of ["bed", "plant", "rug", "computer", "toy"]) {
    const id = p.homeSlots[slot];
    append(
      room,
      append(
        node("div", "", "daily"),
        node("b", `${slot}: ${id ? byId.get(id)?.name : "Empty"}`),
        id
          ? button(
              "Remove",
              async () => {
                await action("/api/equip", {
                  mochiId: p.id,
                  slot,
                  remove: true,
                });
                await render();
              },
              "secondary small",
            )
          : link("Find one", "/explore/market"),
      ),
    );
  }
  append(app, append(grid(wardrobe, room), node("div")));
  app.append(section("Your wardrobe & furnishings"));
  const rows = world.inventory.filter(
    (x) =>
      x.location === "bag" &&
      (x.item.slot || x.item.furnitureSlot || x.item.category === "toy"),
  );
  app.append(
    grid(
      ...rows.map((x) =>
        itemCard(
          x.item,
          x.quantity,
          button(
            "Equip",
            async () => {
              await action("/api/equip", { mochiId: p.id, itemId: x.item.id });
              await render();
            },
            "secondary",
          ),
        ),
      ),
    ),
  );
}
async function collection() {
  const owned = new Set(world.collection.map((x) => x.item_id));
  append(
    app,
    head(
      "Mochipedia",
      "Every discovery stays with you, even after a treat is eaten or a gift is sent.",
      node("span", `${owned.size} / ${ITEMS.length} discoveries`, "pill"),
    ),
    itemTabs(),
  );
  app.append(
    grid(
      ...ITEMS.map((i) =>
        itemCard(
          i,
          null,
          node("small", owned.has(i.id) ? "✓ Discovered" : "Yet to discover"),
          !owned.has(i.id),
        ),
      ),
    ),
  );
}
async function market() {
  await api("/api/visit", { location: "market" });
  append(
    app,
    head(
      "Market Row",
      "Small shops. Lovely things. Check back when the shelves restock.",
      link("Player shops", "/shops", "button secondary"),
    ),
  );
  app.append(
    grid(
      ...SHOPS.map((s) =>
        card(
          node("div", s.icon, "icon"),
          node("h2", s.name),
          node("p", s.description, "muted"),
          node("small", `Restocks every ${s.restockIntervalMinutes} minutes`),
          append(
            node("div", "", "actions"),
            link(
              "Browse the shelves",
              "/explore/market/" + s.slug,
              "button secondary small",
            ),
          ),
        ),
      ),
    ),
  );
}
async function npcShop(slug) {
  const s = await api("/api/npc/" + encodeURIComponent(slug));
  append(
    app,
    head(
      s.name,
      `${s.keeper} · ${s.description}`,
      link("← Market Row", "/explore/market", "button secondary"),
    ),
    card(
      node(
        "p",
        `Next restock: ${new Date(s.nextRestockAt).toLocaleTimeString()} · Rarer finds appear less often.`,
        "muted",
      ),
    ),
  );
  app.append(section("On the shelves"));
  const g = grid();
  for (const row of s.stock) {
    const b = button(
      row.quantity ? "Buy one" : "Sold out",
      async () => {
        await action("/api/buy", {
          shopId: s.id,
          itemId: row.item.id,
          quantity: 1,
        });
        await render();
      },
      "small",
    );
    b.disabled = !row.quantity;
    g.append(
      itemCard(
        row.item,
        null,
        append(
          node("div"),
          node("b", `${row.price} ${currencyLabel()}`, "price"),
          node("p", `${row.quantity} in stock`, "muted"),
          b,
        ),
      ),
    );
  }
  app.append(g);
}
async function shops() {
  const rows = await api("/api/shops");
  append(
    app,
    head(
      "From one explorer to another.",
      "Player shops hold real items from real bags.",
      link("Your shop", "/shop/" + world.user.username, "button secondary"),
    ),
    rows.length
      ? grid(
          ...rows.map((s) =>
            card(
              node("div", "🛍️", "icon"),
              node("h2", s.title),
              node("p", "@" + s.username, "muted"),
              link("Browse", "/shop/" + s.username, "button secondary"),
            ),
          ),
        )
      : blank(
          "The neighborhood shops are waiting for their first listings. List an item from your inventory to open yours.",
        ),
  );
}
async function playerShop(username) {
  const s = await api("/api/shop/" + encodeURIComponent(username));
  append(
    app,
    head(
      s.title,
      s.description,
      link(
        "Meet " + s.owner.displayName,
        userPath(s.owner),
        "button secondary",
      ),
    ),
  );
  if (username === world.user.username)
    app.append(
      card(
        node(
          "p",
          "List a tradable item from your inventory. Items stay safely in your shop until sold or returned.",
        ),
        link("Choose an item", "/inventory", "button small"),
      ),
    );
  app.append(section("Little treasures"));
  if (!s.listings.length)
    return app.append(
      blank("The shelves are empty for now. Come back for a new discovery."),
    );
  app.append(
    grid(
      ...s.listings.map((l) =>
        itemCard(
          l.item,
          l.quantity,
          append(
            node("div"),
            node("b", `${l.price} ${currencyLabel()} each`, "price"),
            append(
              node("div", "", "actions"),
              username === world.user.username
                ? button(
                    "Return to bag",
                    async () => {
                      await action("/api/listings/cancel", { listingId: l.id });
                      await render();
                    },
                    "secondary small",
                  )
                : button(
                    "Buy one",
                    async () => {
                      await action("/api/listings/buy", {
                        listingId: l.id,
                        quantity: 1,
                      });
                      await render();
                    },
                    "small",
                  ),
            ),
          ),
        ),
      ),
    ),
  );
}
async function room(id, research = false) {
  const p = await api("/api/pet/" + encodeURIComponent(id));
  if (p.owner.username !== world.user.username)
    return app.append(
      head(
        p.name + "’s home",
        "Only their explorer can enter the private room.",
      ),
      link("View public profile", petPath(p), "button"),
    );
  append(
    app,
    head(
      research ? "Research Lab" : p.name + "’s cozy little home",
      research
        ? "A window into the complete Cadence connectome."
        : "Spend a little time together. They remember the small things.",
      link(
        research ? "Return home" : "Their profile",
        research ? petPath(p) + "/home" : petPath(p),
        "button secondary",
      ),
    ),
  );
  if (research)
    app.append(
      card(
        node(
          "p",
          "Brain activity, words, memory and continuation belong to this Mochi’s saved Cadence life. Advanced observation tools live here.",
          "muted",
        ),
      ),
    );
  if(research){const latest=await api('/api/pet/'+encodeURIComponent(id));const b=latest.battle;if(b){app.append(card(node('h3','Battle observation'),node('p',`${b.decisions} decisions · ${b.damage} damage · ${b.protection} damage prevented`),tags(Object.entries(b.actions).map(([a,n])=>a.replaceAll('_',' ')+': '+n)),node('p',(b.recent??[]).slice(-5).map(r=>r.action?.replaceAll('_',' ')??'Held still').join(' → ')),node('small','Battle and trading keep separate saved Cadence controllers. These are observed actions.')));}}
  const f = node("iframe", "", "room-frame");
  f.title = research ? "Cadence Research Lab" : "Mochi home room";
  f.src =
    "/room-embed.html?mochi=" +
    encodeURIComponent(id) +
    (research ? "&research=1" : "");
  app.append(f);
  currentCleanup = async () => {
    if (f.contentWindow?.mochi) {
      const saved = await f.contentWindow.mochi.save(false);
      if (saved === false)
        throw new Error(
          "The room could not save. Use Save in the room or reload after recovering the connection.",
        );
      await f.contentWindow.mochi.releaseRoom();
    }
  };
}
function table(headers, rows) {
  const wrap = node("div", "", "card table-wrap"),
    t = node("table"),
    h = node("thead"),
    tr = node("tr");
  headers.forEach((x) => tr.append(node("th", x)));
  h.append(tr);
  t.append(h);
  const body = node("tbody");
  for (const row of rows) {
    const r = node("tr");
    for (const value of row) {
      const cell = node("td");
      if (value instanceof Node) cell.append(value);
      else cell.textContent = String(value);
      r.append(cell);
    }
    body.append(r);
  }
  t.append(body);
  return append(wrap, t);
}
async function trading(lab = false) {
  await api("/api/visit", { location: "trading" });
  const p = world.activeMochi;
  append(
    app,
    head(
      lab ? "Trading Lab" : "The Trading Floor",
      "A quiet place to watch your Mochi learn. All portfolios use simulated funds.",
    ),
    tabs([
      ["Trading Floor", "/explore/trading"],
      ["Portfolio", "/trading/portfolio"],
      ["Trading Lab", "/trading/lab"],
      ["Daily Cup", "/trading/competitions"],
      ["Leaderboard", "/leaderboard"],
    ]),
  );
  if (!p) return app.append(blank("Adopt a Mochi to begin."));
  const saved = await api("/api/trading/" + p.id);
  const state = saved.state,
    port = p.portfolio;
  app.append(
    card(
      node("div", "MOCHI’S THOUGHT", "eyebrow"),
      node("p", state.commentary ?? "A little curious about what comes next."),
    ),
    append(
      node("div", "", "actions"),
      link("Enter the Trading Lab", "/trading/lab", "button"),
      link("Auctions · Soon", "/trading/auctions", "button secondary"),
      link("Trading Post · Soon", "/trading/post", "button secondary"),
    ),
  );
  app.append(
    grid(
      card(
        node("div", "PAPER PORTFOLIO", "eyebrow"),
        node("div", money(portfolioValue(port)), "metric"),
        node(
          "p",
          `${((portfolioValue(port) / port.startingBalance - 1) * 100).toFixed(2)}% return`,
        ),
      ),
      card(
        node("div", "AVAILABLE PAPER CASH", "eyebrow"),
        node("div", money(port.cash), "metric"),
        node(
          "p",
          "Items use $MOCHI SPL-token checkout; test mode uses explicitly fake development tokens.",
          "muted",
        ),
      ),
      card(
        node("div", "CADENCE’S LAST CHOICE", "eyebrow"),
        node(
          "div",
          state.lastDecision?.action ?? "Finding their feet",
          "metric",
        ),
        node(
          "p",
          state.lastDecision
            ? `${new Date(state.lastDecision.at).toLocaleTimeString()} · ${state.lastDecision.source.toUpperCase()} DATA`
            : "First decision is waiting for a server tick.",
          "muted",
        ),
      ),
    ),
  );
  app.append(
    section("Positions"),
    port.positions.length
      ? table(
          ["Asset", "Quantity", "Entry", "Value"],
          port.positions.map((x) => [
            x.symbol,
            x.quantity.toPrecision(5),
            money(x.averageEntry),
            money(x.quantity * x.currentPrice),
          ]),
        )
      : blank("No positions yet. Give your Mochi time to observe."),
  );
  app.append(
    section("Their decisions"),
    p.trades.length
      ? table(
          ["Time", "Action", "Asset", "Quantity", "Price"],
          p.trades
            .slice(-20)
            .reverse()
            .map((t) => [
              new Date(t.timestamp).toLocaleString(),
              t.side,
              t.symbol,
              t.quantity.toPrecision(5),
              money(t.price),
            ]),
        )
      : blank("No paper trades yet. Cadence alone chooses the actions."),
  );
  app.append(
    card(
      node(
        "p",
        "Normal observations arrive every five minutes; competition observations arrive every minute. Sleep pauses trading. An open room has exclusive use of the same brain; scheduled trading resumes when you leave it.",
        "muted",
      ),
    ),
  );
  if (lab) {
    app.append(
      section("Market observations"),
      state.lastObservations
        ? table(
            ["Asset", "Price", "5m return", "Source"],
            state.lastObservations.map((x) => [
              x.symbol,
              money(x.price),
              x.return5m === null
                ? "Collecting history"
                : (x.return5m * 100).toFixed(2) + "%",
              x.source.toUpperCase(),
            ]),
          )
        : blank(
            "Observations appear after the next scheduled Cadence decision.",
          ),
      section("Total paper P&L"),
      card(node("h2", money(port.realizedPnl + port.unrealizedPnl))),
      section("Observation & risk"),
      card(
        node(
          "p",
          "Maximum asset exposure: 30% · Drawdown stop: 20% · Maximum 6 orders/hour · 5 minute order cooldown.",
          "muted",
        ),
        tags([
          config.marketMode === "live"
            ? "Public live provider · labeled fallback"
            : "Deterministic simulated market",
        ]),
        node(
          "pre",
          JSON.stringify(
            state.lastDecision ?? { status: "Awaiting scheduled decision" },
            null,
            2,
          ),
        ),
      ),
    );
  }
  const timer = setTimeout(() => navigate(location.pathname), 30000);
  currentCleanup = async () => clearTimeout(timer);
}
async function cups() {
  await api("/api/visit", { location: "arena" });
  const c = await api("/api/competitions");
  append(
    app,
    head(
      "The Daily Paper Cup",
      "A fresh paper portfolio. The same little brain.",
      link("Leaderboard", "/leaderboard", "button secondary"),
    ),
    tabs([
      ["Competition", "/trading/competitions"],
      ["Trading Lab", "/trading/lab"],
    ]),
  );
  const joined = c.entries.some((x) => x.username === world.user.username);
  const b = button(
    joined
      ? "✓ Your Mochi is entered"
      : "Enter " + (world.activeMochi?.name ?? "Mochi"),
    async () => {
      await action("/api/competitions/enter", {
        mochiId: world.activeMochi.id,
      });
      await render();
    },
  );
  b.disabled = joined || !world.activeMochi;
  app.append(
    card(
      node("div", "DAILY COMPETITION", "eyebrow"),
      node("h2", c.cup.name),
      node(
        "p",
        `Closes ${new Date(c.cup.ends_at).toLocaleString()} · ${c.entries.length} real entries`,
      ),
      node(
        "p",
        "Each Mochi starts with $10,000 simulated cash. Only server-run Cadence decisions count. One entry per explorer.",
        "muted",
      ),
      b,
    ),
  );
  app.append(
    section("Rewards"),
    tags([
      "1st: 1,000 test reward points + trophy",
      "Top 10: 500 test reward points",
      "Top 100: 200 test reward points",
      "Participation: 25 test reward points",
    ]),
    node(
      "p",
      "At least three entrants are required for podium rewards. Smaller cups award participation only. Rewards settle once after the cup closes.",
      "muted",
    ),
    section("The field"),
    c.entries.length
      ? table(
          ["Rank", "Mochi", "Explorer", "Portfolio", "Return", "Trades"],
          c.entries.map((e, i) => [
            e.rank ?? i + 1,
            link(e.name, "/mochi/" + e.mochiId),
            link("@" + e.username, "/user/" + e.username),
            money(e.value),
            e.returnPct.toFixed(2) + "%",
            e.trades,
          ]),
        )
      : blank("Be the first explorer to join today’s cup."),
  );
}
async function leaderboard() {
  const rows = await api("/api/leaderboard");
  append(
    app,
    head(
      "Little traders, big curiosity.",
      "Actual saved Mochis, ranked by simulated lifetime return.",
      link("Enter the Daily Cup", "/trading/competitions", "button secondary"),
    ),
    rows.length
      ? table(
          ["Rank", "Mochi", "Explorer", "Paper value", "Return", "Trades"],
          rows.map((r, i) => [
            i + 1,
            link(r.name, "/mochi/" + r.id),
            link("@" + r.username, "/user/" + r.username),
            money(r.value),
            r.returnPct.toFixed(2) + "%",
            r.trades,
          ]),
        )
      : blank("No portfolios yet."),
  );
}
async function bank() {
  await api("/api/visit", { location: "bank" });
  append(
    app,
    head("The Coin Bank", "Every little Coin has a story."),
    card(
      node("div", "YOUR MOCHI COINS", "eyebrow"),
      node(
        "div",
        world.currency.formatted +
          (world.currency.mock ? " TEST $MOCHI" : " $MOCHI"),
        "metric",
      ),
      node(
        "p",
        "Spend them on treats, discoveries and a cozy home. Paper portfolios use a separate simulated balance.",
        "muted",
      ),
    ),
    section("Recent transactions"),
    table(
      ["When", "Activity", "test rewards"],
      world.ledger.map((x) => [
        new Date(x.created_at).toLocaleString(),
        x.type.replaceAll("_", " "),
        (x.amount >= 0 ? "+" : "") + x.amount,
      ]),
    ),
  );
}
async function friends() {
  append(
    app,
    head(
      "Good company.",
      "A little world feels bigger with a friend.",
      link("Visit Mochi Park", "/explore/park", "button secondary"),
    ),
  );
  app.append(
    card(
      node("h2", "Find an explorer"),
      form(
        [{ name: "username", label: "Explorer username" }],
        "Send friend request",
        async (data) => {
          await action("/api/friends/request", data);
          await render();
        },
      ),
    ),
  );
  if (world.friends.requests.length) {
    app.append(section("At your doorstep"));
    for (const r of world.friends.requests)
      app.append(
        card(
          node("h3", r.display_name + " would like to be friends."),
          append(
            node("div", "", "actions"),
            button("Accept", async () => {
              await action("/api/friends/respond", {
                requestId: r.id,
                accept: true,
              });
              await render();
            }),
            button(
              "Decline",
              async () => {
                await action("/api/friends/respond", {
                  requestId: r.id,
                  accept: false,
                });
                await render();
              },
              "secondary",
            ),
          ),
        ),
      );
  }
  app.append(section("Your friends"));
  app.append(
    world.friends.friends.length
      ? grid(
          ...world.friends.friends.map((u) =>
            card(
              node("div", "♡", "icon"),
              link(u.display_name, userPath(u)),
              node("p", "@" + u.username, "muted"),
              append(
                node("div", "", "actions"),
                link("Shop", "/shop/" + u.username, "button secondary small"),
                button(
                  "Remove",
                  async () => {
                    await action("/api/friends/remove", { userId: u.id });
                    await render();
                  },
                  "secondary small",
                ),
              ),
            ),
          ),
        )
      : blank(
          "Friends begin with a hello. Send a request to another explorer.",
        ),
  );
}
async function park() {
  await api("/api/visit", { location: "park" });
  const pets = await api("/api/park");
  append(
    app,
    head(
      "Mochi Park",
      "A place for little companions and their people.",
      link("Your friends", "/friends", "button secondary"),
    ),
    tabs([
      ["Neighbors", "/explore/park"],
      ["Friends", "/friends"],
      ["Guilds", "/guilds"],
    ]),
  );
  const friendNames = new Set(world.friends.friends.map((x) => x.username));
  const friendly = pets.filter((p) => friendNames.has(p.username));
  app.append(
    section("Friends’ Mochis"),
    friendly.length
      ? grid(
          ...friendly.map((p) =>
            card(
              node("h3", p.name),
              link("Meet " + p.name, "/mochi/" + p.id, "button secondary"),
            ),
          ),
        )
      : blank("Make a friend to see their Mochis here."),
    section("Recently active neighbors"),
  );
  app.append(
    grid(
      ...pets.map((p) =>
        card(
          portrait({ equipped: {} }),
          node("h3", p.name),
          link("Cared for by @" + p.username, "/user/" + p.username),
          append(
            node("div", "", "actions"),
            link("Meet " + p.name, "/mochi/" + p.id, "button secondary small"),
          ),
        ),
      ),
    ),
  );
  if (!pets.length) app.append(blank("The park is quiet today."));
}
async function community() {
  append(
    app,
    head(
      "A small community.",
      "Meet an explorer. Share a treasure. Start a new story.",
    ),
    grid(
      destination({
        name: "Mochi Park",
        icon: "🌳",
        description: "Meet the city’s actual little companions.",
        path: "/explore/park",
      }),
      destination({
        name: "Friends",
        icon: "♡",
        description: "Requests, friendships and gifts.",
        path: "/friends",
      }),
      destination({
        name: "Player shops",
        icon: "🛍️",
        description: "Treasures from other explorers.",
        path: "/shops",
      }),
      destination({
        name: "Your story",
        icon: "✉️",
        description: "Actual events from your adventures.",
        path: "/community/events",
      }),
      destination({
        name: "Guilds",
        icon: "⚑",
        description: "A place to gather, coming soon.",
        path: "/guilds",
      }),
    ),
  );
}
async function activity() {
  append(
    app,
    head(
      "Your story so far.",
      "Real little moments from your life in Mochi City.",
      button(
        "Mark as read",
        async () => {
          await action("/api/events/read", {});
          await render();
        },
        "secondary",
      ),
    ),
    card(events(world.events, 30)),
  );
}
function coming(title, icon, description) {
  append(
    app,
    head(title, "Another corner of the city is taking shape."),
    append(
      node("div", "", "coming"),
      node("div", icon, "icon"),
      node("span", "COMING SOON", "pill"),
      node("h2", title),
      node("p", description, "muted"),
      link("Explore the city", "/explore", "button secondary"),
    ),
  );
}
async function arcade() {
  await api("/api/visit", { location: "arcade" });
  append(
    app,
    head(
      "The Cloudberry Arcade",
      "A quick little game, a pocketful of test rewards.",
      link("The city map", "/explore", "button secondary"),
    ),
  );
  const c = card(
      node("div", "BERRY BASKET", "eyebrow"),
      node("h2", "Catch a little joy."),
      node(
        "p",
        "Catch cloudberries before they float away. Each round lasts 45 seconds. Earn 3 test rewards per berry, up to 100 arcade test rewards each calendar day.",
        "muted",
      ),
    ),
    field = node("div", "", "arcade-field"),
    status = node("div", "", "arcade-status"),
    score = node("span", "0 berries"),
    clock = node("span", "45 seconds");
  append(status, score, clock);
  append(c, status, field);
  const start = button("Play Berry Basket", async () => {
    start.disabled = true;
    start.dataset.keepDisabled = "1";
    const round = await api("/api/arcade/start", {});
    let current = -1,
      hits = new Set(),
      finishing = false;
    const began = new Date(round.startedAt).getTime(),
      ends = new Date(round.endsAt).getTime();
    const timer = setInterval(async () => {
      const remaining = Math.max(0, ends - Date.now());
      clock.textContent = Math.ceil(remaining / 1000) + " seconds";
      if (!remaining && !finishing) {
        finishing = true;
        clearInterval(timer);
        field.replaceChildren();
        try {
          const result = await action("/api/arcade/finish", {
            roundId: round.id,
          });
          score.textContent = `${result.score} ${result.score === 1 ? "berry" : "berries"} · +${result.reward} ${world.currency.mock ? "TEST $MOCHI" : "reward points (no token transfer)"}`;
          delete start.dataset.keepDisabled;
          start.disabled = false;
        } catch (e) {
          delete start.dataset.keepDisabled;
          start.disabled = false;
          notice(e.message);
        }
        return;
      }
      const tick = Math.floor((Date.now() - began) / 1500);
      if (tick !== current && tick >= 0 && tick < 30) {
        current = tick;
        field.replaceChildren();
        const berry = button(
          "🫐",
          async () => {
            const result = await api("/api/arcade/hit", {
              roundId: round.id,
              tick,
            });
            hits.add(tick);
            score.textContent =
              result.score + (result.score === 1 ? " berry" : " berries");
            berry.remove();
          },
          "berry",
        );
        berry.setAttribute("aria-label", "Catch cloudberry");
        berry.style.left = 8 + ((round.seed + tick * 73) % 78) + "%";
        berry.style.top = 8 + ((round.seed * 7 + tick * 43) % 66) + "%";
        field.append(berry);
      }
    }, 100);
    currentCleanup = async () => clearInterval(timer);
  });
  append(c, start);
  app.append(c);
}
async function render() {
  app.replaceChildren();
  const aliases = {
    "/items/inventory": "/inventory",
    "/items/closet": "/closet",
    "/items/collection": "/collection",
    "/items/storage": "/storage",
    "/trading/leaderboard": "/leaderboard",
    "/community/friends": "/friends",
    "/community/guilds": "/guilds",
  };
  const path = aliases[location.pathname] ?? location.pathname;
  for (const a of document.querySelectorAll("#navigation a"))
    a.classList.toggle(
      "active",
      path === a.pathname ||
        (a.pathname === "/explore" && path.startsWith("/explore")) ||
        (a.pathname === "/inventory" &&
          ["/storage", "/closet", "/collection", "/items"].includes(path)) ||
        (a.pathname === "/trading/portfolio" &&
          (path.startsWith("/trading") || path === "/leaderboard")) ||
        (a.pathname === "/community" && ["/friends", "/guilds"].includes(path)),
    );
  if (path === "/pets") return home();
  if (path === "/wallet") return walletPage(app);
  if (path === "/treasury") return treasuryPage(app);
  if (
    path === "/" ||
    path === "/home" ||
    path === "/world" ||
    path.startsWith("/world/") ||
    path.startsWith("/home/")
  ) {
    currentCleanup = await mountWorld(app, {
      world,
      config,
      startRoom: path.startsWith("/home/")
        ? "home:" + decodeURIComponent(path.slice(6))
        : path.startsWith("/world/")
          ? path.slice(7)
          : "town",
    });
    return;
  }

  if (path === "/dailies") {
    append(
      app,
      head("Little daily rituals", "A reason to visit, every calendar day."),
      dailyCard(),
    );
    return;
  }
  if (path === "/explore") return explore();
  if (path === "/inventory" || path === "/items") return inventory();
  if (path === "/storage") return inventory(true);
  if (path === "/closet") return closet();
  if (path === "/collection") return collection();
  if (path === "/explore/market") return market();
  if (path.startsWith("/explore/market/"))
    return npcShop(decodeURIComponent(path.split("/").at(-1)));
  if (path === "/shops" || path === "/shop") return shops();
  if (path.startsWith("/shop/"))
    return playerShop(decodeURIComponent(path.slice(6)));
  if (path.startsWith("/user/"))
    return userProfile(decodeURIComponent(path.slice(6)));
  if (path.startsWith("/mochi/")) {
    const parts = path.split("/");
    return parts[3] === "home"
      ? room(parts[2])
      : parts[3] === "brain"
        ? room(parts[2], true)
        : profile(parts[2]);
  }
  if (path === "/room")
    return world.activeMochi
      ? room(world.activeMochi.id)
      : coming("Your future home", "🥚", "Adopt a Mochi from Home to begin.");
  if (
    path === "/explore/research" ||
    path === "/debug/brain" ||
    path === "/research"
  )
    return world.activeMochi
      ? room(world.activeMochi.id, true)
      : coming("Research Lab", "🥚", "Adopt a Mochi from Home to begin.");
  if (path === "/explore/arcade") return arcade();
  if (path === "/explore/park") return park();
  if (path === "/explore/bank") return bank();
  if (
    path === "/explore/trading" ||
    path === "/trading/portfolio" ||
    path === "/trade"
  )
    return trading();
  if (path === "/trading/lab") return trading(true);
  if (
    path === "/trading/competitions" ||
    path === "/arena" ||
    path === "/explore/arena"
  )
    return cups();
  if (path === "/leaderboard") return leaderboard();
  if (path === "/friends") return friends();
  if (path === "/community") return community();
  if (path === "/community/events") return activity();
  if (path === "/community/messages")
    return coming(
      "The Letter Box",
      "✉️",
      "Private messages are coming in a later chapter.",
    );
  if (path === "/guilds")
    return coming(
      "Guild Hall",
      "⚑",
      "Clubs, shared goals and a room for your friends. Guild membership is coming in a later chapter.",
    );
  if (path === "/trading/auctions")
    return coming(
      "The Auction House",
      "🔨",
      "A place for rare finds, with fair bidding and a patient clock.",
    );
  if (path === "/trading/post")
    return coming(
      "The Trading Post",
      "⇄",
      "Offer a treasure in exchange for another. Item swaps are coming in a later chapter.",
    );
  app.append(
    head("A little wrong turn.", "This corner is still waiting for its story."),
    link("Go home", "/home", "button"),
  );
}
async function performNavigation(path, replace = false) {
  if (accountGateVisible) return;
  if (currentCleanup) {
    const cleanup = currentCleanup;
    await cleanup();
    currentCleanup = null;
  }
  if (path !== location.pathname) {
    history[replace ? "replaceState" : "pushState"]({}, "", path);
  }
  await refresh();
  try {
    await render();
  } catch (e) {
    app.replaceChildren(
      head("The city needs a moment.", e.message),
      button("Try again", () => navigate(location.pathname), "secondary"),
    );
  }
  window.scrollTo(0, 0);
}
function navigate(path) {
  routeSerial = routeSerial
    .catch(() => {})
    .then(() => performNavigation(path))
    .catch((e) => notice(e.message));
  return routeSerial;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (
    a &&
    a.origin === location.origin &&
    !a.pathname.endsWith(".html") &&
    !e.metaKey &&
    !e.ctrlKey
  ) {
    e.preventDefault();
    if (window.parent !== window && /^\/(home|world)(\/|$)/.test(a.pathname)) {
      window.parent.postMessage(
        {
          type: "worldRoom",
          roomId: a.pathname.startsWith("/home/")
            ? "home:" + a.pathname.slice(6)
            : "town",
        },
        location.origin,
      );
      return;
    }
    navigate(a.pathname);
  }
});
window.addEventListener("popstate", () => navigate(location.pathname));
for (const [title, path] of [
  ["Home", "/home"],
  ["Explore", "/explore"],
  ["My Mochi", "#pet"],
  ["Items", "/items/inventory"],
  ["Trading", "/trading/portfolio"],
  ["Community", "/community"],
]) {
  const a = link(title, path);
  if (path === "#pet")
    a.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (world.activeMochi) navigate(petPath(world.activeMochi));
    };
  document.querySelector("#navigation").append(a);
}
async function enterWorld() {
  config = await api("/api/config");
  await refresh();
  document.querySelector("#navigation").hidden = false;
  document.querySelector(".account").hidden = false;
  document.querySelector("#signOut").hidden = !config.authentication;
  document.querySelector("#signOut").onclick = async () => {
    const button = document.querySelector("#signOut");
    button.disabled = true;
    try {
      if (currentCleanup) { await currentCleanup(); currentCleanup = null; }
      await api("/api/auth/logout", {});
      location.assign("/home");
    } catch (e) { notice(e.message); }
    finally { button.disabled = false; }
  };
  document.querySelector("#devLogin").hidden = !config.development;
  document.querySelector("#devLogin").onclick = () =>
    modal(
      "Development account",
      append(
        node("div"),
        node(
          "p",
          "Local testing only. This is not production authentication. Use another username to test real friend requests and player shops.",
          "muted",
        ),
        form(
          [
            {
              name: "username",
              label: "Username · lowercase letters, numbers, underscore",
              value: world.user.username,
            },
          ],
          "Switch account",
          async (data) => {
            if (currentCleanup) {
              await currentCleanup();
              currentCleanup = null;
            }
            await api("/api/dev/login", data);
            await navigate("/home");
          },
        ),
      ),
    );
  if (location.pathname === "/") history.replaceState({}, "", "/home");
  await render();
}
async function showAccountGate() {
  if (accountGateVisible) return;
  accountGateVisible = true;
  // A separate top-layer dialog preserves both React and iframe room panels.
  // In particular, do not force cleanup while their save cannot authenticate.
  const gate = node("dialog", "", "account-recovery-dialog");
  gate.oncancel = (event) => event.preventDefault();
  const recover = accountRecovery({ ownerId: world?.user?.id,
    identify: async () => (await api("/api/world")).user.id,
    cleanup: async () => {
      if (currentCleanup) { await currentCleanup(); currentCleanup = null; }
    },
    enter: async () => {
      await enterWorld();
      gate.close(); gate.remove(); accountGateVisible = false;
    },
  });
  try {
    accountGate(gate, { request: api, recovering: !!currentCleanup, ready: recover,
      exportRetained: async () => {
        const rooms = [];
        function findRooms(frame) {
          try {
            if (typeof frame.mochi?.snapshot === "function") rooms.push(frame.mochi);
            for (let i = 0; i < frame.frames.length; i++) findRooms(frame.frames[i]);
          } catch { /* A foreign frame cannot hold this same-origin room. */ }
        }
        findRooms(window);
        if (rooms.length !== 1) throw new Error("No single initialized room is available to export. Keep this page open and retry saving.");
        const life = await rooms[0].snapshot();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(lifeToBlob(life));
        link.download = "retained-mochi.mochi";
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      },
    });
    document.body.append(gate);
    gate.showModal();
  } catch (error) {
    gate.remove(); accountGateVisible = false;
    throw error;
  }
}
window.addEventListener("mochi:session-expired", () => { showAccountGate().catch((e) => notice(e.message)); });
try {
  await enterWorld();
} catch (e) {
  if (e.status === 401) {
    await showAccountGate();
  } else {
  app.replaceChildren(
    head("The city gates are resting.", e.message),
    node(
      "p",
      "Start the local server and apply the PostgreSQL migration, then reload.",
      "muted",
    ),
  );
  }
}
