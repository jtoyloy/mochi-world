import { SnapshotDecoder } from "./network/snapshots.js";
import { adventureUI } from "./AdventureUI.js";
import { interactionArrived } from "./arrival.js";
import { TOWN_RESIDENTS } from "./town.js";
import { ROOMS, EMOTES, PHRASES, plainText, validSegment } from "./model.js";
import { NavigationService } from "./NavigationService.js";
import { companionPicker } from "./CompanionUI.js";
import { observeOverlayLayout } from "./overlay-layout.js";
const element = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
async function request(path, data) {
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
    const error = new Error(b.error ?? "Please try again");
    error.status = r.status;
    if (r.status === 401) window.dispatchEvent(new Event("mochi:session-expired"));
    throw error;
  }
  return b;
}
const btn = (text, fn) => {
  const b = element("button", text);
  b.type = "button";
  b.onclick = async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      showNotice(e.message);
    } finally {
      b.disabled = false;
    }
  };
  return b;
};
function showNotice(text) {
  const toast = document.querySelector("#toast");
  toast.textContent = text;
  toast.className = "toast";
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => {
    toast.className = "";
  }, 5000);
}
function dialog(title) {
  const d = element("dialog", "", "world-dialog");
  d.requestClose = async () => d.close();
  d.oncancel = (e) => {
    e.preventDefault();
    d.requestClose().catch((e) => showNotice(e.message));
  };
  const close = btn("Close", () => d.requestClose());
  close.className = "dialog-close";
  d.append(element("h2", title), close);
  document.body.append(d);
  d.showModal();
  d.onclose = () => d.remove();
  return d;
}
let domainPanel;
function panel(title, url) {
  if (domainPanel) return domainPanel(title, url);
  const d = dialog(title),
    frame = element("iframe");
  frame.title = title;
  frame.src = url + (url.includes("?") ? "&" : "?") + "panel=1";
  frame.className = "world-web-panel";
  d.append(frame);
  d.requestClose = async () => {
    const nested =
      frame.contentWindow?.document.querySelector(".room-frame")?.contentWindow;
    const mochi = nested?.mochi;
    if (mochi) {
      const saved = await mochi.save(false);
      if (saved === false)
        throw new Error(
          "The brain could not save. Keep this panel open and retry.",
        );
      await mochi.releaseRoom?.();
    }
    d.close();
  };
  return d;
}
export async function mountWorld(
  container,
  { world, config, startRoom = "town" },
) {
  const { mountIsometric, openConversation, openBackpack, openDomainPanel } =
    await import("/build/isoworld.js");
  domainPanel = openDomainPanel;
  document.body.classList.add("playing-world");
  const shell = element("section", "", "social-world");
  const canvas = element("div", null, "world-canvas");
  canvas.id = "r3f-world";
  const top = element("div", null, "world-topbar");
  const roomLabel = element("div", "TOWN SQUARE", "room-label"),
    status = element("span", "Connecting…", "socket-status");
  const balance = btn("Balance", () => panel("Wallet & currency", "/wallet"));
  const map = btn("Map", () => {
    const d = dialog("Where shall we go?"),
      grid = element("div", null, "world-map-grid");
    for (const room of ROOMS)
      grid.append(
        btn(room.name, () => {
          bridge.join(
            room.id === "home" ? "home:" + world.user.username : room.id,
          );
          d.close();
        }),
      );
    d.append(grid);
  });
  const customize = btn("My villager", () => customizeAvatar());
  top.append(
    element("a", "mochi WORLD", "world-wordmark"),
    roomLabel,
    status,
    balance,
    btn("⚙ Settings", () => customizeAvatar()),
  );
  const bottom = element("div", null, "world-dock");
  bottom.append(
    map,
    btn("Items", async () => {
      await refresh();
      openBackpack({
        world,
        refresh,
        notice: showNotice,
        openLegacy: (path) => panel("Your treasures", path),
      });
    }),
    btn("Mochis", () => chooseCompanion()),
    btn("Friends", () => panel("Friends", "/friends")),
    btn("Wardrobe", () => customizeAvatar()),
    btn("Talk", () => talkPanel()),
    btn("Wallet", () => panel("Wallet & currency", "/wallet")),
  );
  const emotes = element("div", null, "world-emotes");
  for (const [key, text] of Object.entries(EMOTES)) {
    const b = btn(text, () => bridge.send("emote", { emote: key }));
    b.setAttribute("aria-label", key + " emote");
    emotes.append(b);
  }
  const phrase = element("select");
  phrase.setAttribute("aria-label", "Predefined public phrase");
  phrase.append(new Option("Say hello…", ""));
  for (const text of PHRASES) phrase.append(new Option(text, text));
  phrase.onchange = () => {
    if (phrase.value) bridge.send("phrase", { phrase: phrase.value });
    phrase.value = "";
  };
  emotes.append(phrase);
  const hint = element(
    "div",
    "Click a path to wander. Your companion will come along.",
    "world-hint",
  );
  shell.append(top, canvas, hint, emotes, bottom);
  container.append(shell);
  let socket,
    reconnectTimer,
    closed = false,
    tearingDown = false,
    conversation = null,
    currentRoom = startRoom,
    players = new Map(),
    pendingInteraction = null,
    pendingDestination = null,
    dialogBusy = false;
  let adventure;
  const bridge = {
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    scene: null,
    selfId: null,
    homeName: world.user.displayName,
    send(type, data) {
      if (socket?.readyState !== WebSocket.OPEN) {
        showNotice("Reconnecting to the world…");
        return false;
      }
      if (type === "move" && bridge.scene?.prepareMove) {
        data = bridge.scene.prepareMove(data);
        if (!data) return false;
      }
      if (socket?.readyState === WebSocket.OPEN) {
        const text = JSON.stringify({ type, data }),
          wire = socket,
          net = bridge.scene?.network;
        const delay =
          config.development && ["move", "ping"].includes(type)
            ? Math.max(
                0,
                (net?.latency ?? 0) +
                  (Math.random() * 2 - 1) * (net?.jitter ?? 0),
              )
            : 0;
        if (delay)
          setTimeout(() => {
            if (
              !closed &&
              wire === socket &&
              wire.readyState === WebSocket.OPEN
            )
              wire.send(text);
          }, delay);
        else wire.send(text);
      } else {
        showNotice("Reconnecting to the world…");
        return false;
      }
      return true;
    },
    status: showNotice,
    connect() {
      if (closed) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/socket`,
      );
      socket.onopen = () => {
        status.textContent = "Joining…";
      };
      socket.onclose = (e) => {
        status.textContent =
          e.code === 4001 ? "Open in another tab" : "Reconnecting…";
        if (!closed && e.code !== 4001)
          reconnectTimer = setTimeout(() => bridge.connect(), 2000);
      };
      const decoder = new SnapshotDecoder();
      const consume = (e) => {
        for (const decoded of decoder.consume(JSON.parse(e.data))) consumeState(decoded);
      };
      const consumeState = ({ type, data }) => {
        adventure?.event(type, data);
        bridge.scene?.motionEvent?.(type, data);
        if (type === "ready") {
          bridge.selfId = data.userId;
          status.textContent = "Online";
          bridge.send("joinRoom", { roomId: currentRoom });
        }
        if (type === "roomSnapshot") {
          bridge.snapshotPlayers = data.players;
          players = new Map(data.players.map((p) => [p.userId, p]));
          currentRoom = data.roomId;
          roomLabel.textContent = `${ROOMS.find((r) => r.id === data.roomId.split(":")[0])?.name ?? "Home"} · ${data.instanceId.split("-").at(-1)}`;
          hint.textContent = `${data.players.length} here · Click a path to walk. Click a doorway to explore.`;
          bridge.scene.setRoomSnapshot(data);
        }
        if (type === "playerJoined") {
          players.set(data.userId, data);
          bridge.scene.put(data);
          hint.textContent = `${players.size} here · Click a path to walk. Your Mochi will come along.`;
        }
        if (type === "playerLeft") {
          players.delete(data.userId);
          bridge.scene.remove(data.userId);
        }
        if (type === "playerMoved") {
          const old = players.get(data.userId);
          if (
            old &&
            (!(data.serverTime && old.serverTime) ||
              data.serverTime >= old.serverTime)
          ) {
            const p = { ...old, ...data };
            players.set(data.userId, p);
            bridge.scene.put(p);
            if (
              data.userId === bridge.selfId &&
              pendingInteraction &&
              interactionArrived(data, pendingDestination)
            ) {
              const prop = pendingInteraction;
              pendingInteraction = null;
              pendingDestination = null;
              if (prop.startsWith("npc:"))
                bridge.send("npc", { id: prop.slice(4) });
              else bridge.send("interact", { propId: prop });
            }
          }
        }
        if (type === "playerEmoted") {
          bridge.scene.emotes.set(data.userId, {
            kind:
              Object.keys(EMOTES).find((k) => EMOTES[k] === data.text) ??
              "wave",
            at: Date.now(),
          });
          bridge.scene.bubbles.say(
            "player:" + data.userId,
            bridge.scene.players.get(data.userId)?.root,
            data.text,
          );
        }
        if (type === "mochiSpoke") {
          const pet = bridge.scene.pets.get(data.userId);
          bridge.scene.bubbles.say("pet:" + data.mochiId, pet?.root, data.text);
          if (data.userId === bridge.selfId && conversation) {
            conversation.append(
              element(
                "p",
                `${world.activeMochi?.name ?? "Mochi"}: ${data.text}`,
              ),
            );
            conversation.scrollTop = conversation.scrollHeight;
          }
          hint.textContent = `${pet?.name.text ?? "Mochi"}: ${data.text}`;
        }
        if (type === "companionReact") {
          bridge.scene.reactions.set(data.mochiId, {
            kind: data.kind,
            at: Date.now(),
          });
          bridge.scene.audio.cue("pet");
        }
        if (type === "npcDialogue") {
          const d = dialog(data.name + " · Town resident"),
            portrait = element("div", "✦", "npc-portrait");
          portrait.style.background =
            TOWN_RESIDENTS.find((n) => n.id === data.id)?.color ?? "#9db7ad";
          d.append(portrait, element("p", data.line));
          bridge.scene.audio.cue("pet");

          if (data.shop)
            d.append(
              btn("Browse shop", () => {
                d.close();
                bridge.scene.audio.cue("bell");
                openInteraction("shop:" + data.shop);
              }),
            );
          if (data.vendor)
            d.append(
              btn("Sell resources", () => {
                d.close();
                return adventure.vendor(data.vendor);
              }),
            );
          if (data.id === "pip")
            for (const [label, text] of [
              [
                "Where can I buy food?",
                "Mina’s counter is in the café corner, west of the fountain.",
              ],
              [
                "Where is the Exchange?",
                "Look for the teal building and paper price board on the north side.",
              ],
              [
                "Tell me about Mochis.",
                "Your Mochi remembers life with you. Feed it, play together, and talk. It chooses its own actions in paper competitions.",
              ],
            ])
              d.append(btn(label, () => d.append(element("p", text))));
          if (data.id === "bea")
            d.append(
              btn("Dance along", () =>
                bridge.send("emote", { emote: "dance" }),
              ),
            );
        }
        if (type === "interaction") {
          if (bridge.scene)
            bridge.scene.lastInteraction = {
              userId: bridge.selfId,
              propId: data.propId,
            };
          if (data.text) showNotice(data.text);
          openInteraction(data.propId);
        }
        if (type === "error") {
          pendingInteraction = null;
          const self = bridge.scene.players.get(bridge.selfId);
          if (self) self.prediction = null;
          showNotice(data.message);
        }
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data),
          net = bridge.scene?.network;
        if (
          config.development &&
          ["movementSnapshot", "playerMoved", "moveAccepted", "moveRejected", "pong"].includes(
            msg.type,
          )
        ) {
          if (
            ["movementSnapshot", "playerMoved"].includes(msg.type) &&
            Math.random() * 100 < (net?.loss ?? 0)
          )
            return;
          const delay = Math.max(
            0,
            (net?.latency ?? 0) + (Math.random() * 2 - 1) * (net?.jitter ?? 0),
          );
          if (delay) {
            setTimeout(() => {
              if (!closed) consume(event);
            }, delay);
            return;
          }
        }
        consume(event);
      };
    },
    join(roomId) {
      currentRoom = roomId;
      bridge.scene.transition();
      pendingInteraction = null;
      bridge.send("joinRoom", { roomId });
    },
    cancelInteraction() {
      pendingInteraction = null;
    },
    resident(id, x, y) {
      const self = players.get(bridge.selfId);
      if (!self) return;
      if (Math.hypot(self.x - x, self.y - y) <= 120) {
        bridge.send("npc", { id });
        return;
      }
      const nav = new NavigationService(currentRoom);
      for (const [dx, dy] of [
        [0, 90],
        [90, 0],
        [-90, 0],
        [0, -90],
      ]) {
        const q = nav.nearestWalkable({ x: x + dx, y: y + dy });
        if (q && Math.hypot(q.x - x, q.y - y) <= 120 && nav.findPath(self, q)) {
          pendingInteraction = "npc:" + id;
          pendingDestination = q;
          if (!bridge.scene.moveTo(q, { interaction: true }))
            pendingInteraction = null;
          return;
        }
      }
      showNotice("Walk to the path beside the resident.");
    },
    interact(id, x, y) {
      if (ROOMS.some((r) => r.id === id)) {
        bridge.join(id);
        return;
      }
      const self = players.get(bridge.selfId);
      if (!self) return;
      if (
        Math.hypot(self.x - x, self.y - y) <
        (id.startsWith("sit:") ||
        ["mailbox", "noticeboard", "fountain"].includes(id)
          ? 120
          : 190)
      ) {
        bridge.send("interact", { propId: id });
        return;
      }
      if (new NavigationService(currentRoom).findPath(self, { x, y })) {
        pendingInteraction = id;
        pendingDestination = { x, y };
        bridge.send("move", { x, y });
      } else showNotice("Walk around the fountain, then click the doorway.");
    },
    targetMob(mob) {
      bridge.send("adventure", { action: "target", targetId: mob.id });
      const self = bridge.scene.data.get(bridge.selfId);
      if (self && Math.hypot(self.x - mob.x, self.y - mob.y) > 80) {
        const nav = new NavigationService(currentRoom);
        const goal = nav.nearestWalkable({ x: mob.x - 60, y: mob.y + 30 });
        if (goal) bridge.scene.moveTo(goal);
      }
    },
    gather(node) {
      adventure.gatherNode(node).catch((e) => showNotice(e.message));
    },
    selectPlayer(id) {
      const p = players.get(id);
      if (!p) return;
      if (id === bridge.selfId) {
        customizeAvatar();
        return;
      }
      const d = dialog(p.avatar.display_name);
      d.append(
        btn("Profile", () => panel("Player profile", "/user/" + p.username)),
        btn("Wave", () => bridge.send("emote", { emote: "wave" })),
      );
      const friend = world.friends.friends.find((f) => f.id === id);
      d.append(
        btn(friend ? "Remove friend" : "Add friend", async () => {
          await request(
            friend ? "/api/friends/remove" : "/api/friends/request",
            friend ? { userId: id } : { username: p.username },
          );
          showNotice("Friend request updated");
          world = await request("/api/world");
          d.close();
        }),
      );
      if (friend) {
        d.append(
          btn("Gift", () => panel("Gift an item", "/items/inventory")),
          btn("Visit home", () => {
            bridge.join("home:" + p.username);
            d.close();
          }),
        );
      }
      d.append(btn("Shop", () => panel("Player shop", "/shop/" + p.username)));
      if (p.companion)
        d.append(
          btn("Inspect Mochi", () =>
            panel("Mochi profile", "/mochi/" + p.companion.id),
          ),
        );
    },
    inspectPet(id) {
      panel("Mochi profile", "/mochi/" + id);
    },
    selectPet(owner, id) {
      if (owner !== bridge.selfId) {
        panel("Mochi profile", "/mochi/" + id);
        return;
      }
      const d = dialog(players.get(owner)?.companion?.name ?? "Your Mochi");
      for (const [kind, label] of [
        ["pet", "Pet"],
        ["feed", "Feed"],
        ["play", "Play"],
        ["talk", "Talk"],
        ["profile", "Profile"],
      ])
        d.append(
          btn(label, () => {
            d.close();
            if (kind === "talk") talkPanel();
            else if (kind === "profile") panel("Mochi profile", "/mochi/" + id);
            else care(kind);
          }),
        );
    },
  };
  async function refresh() {
    world = await request("/api/world");
    balance.textContent = `${world.currency.formatted} ${world.currency.mock ? "TEST $MOCHI" : "$MOCHI"}`;
    balance.title = world.currency.mock
      ? "Fake development currency. No on-chain funds."
      : world.currency.network;
    return world;
  }
  function openInteraction(id) {
    if (id.startsWith("vendor:")) {
      adventure.vendor(id.slice(7)).catch((e) => showNotice(e.message));
      return;
    }
    if (id.startsWith("shop:")) {
      const vendorId = id.slice(5);
      if (["blacksmith", "mage", "apothecary", "charms"].includes(vendorId)) {
        adventure.shop(vendorId).catch((e) => showNotice(e.message));
        return;
      }
      const shops = {
        foods: "mochi-foods",
        toys: "toy-box",
        threads: "threads-and-things",
        home: "home-goods",
        tech: "trader-tech",
        rare: "rare-finds",
        blacksmith: "blacksmith",
        mage: "mage",
        apothecary: "apothecary",
        charms: "charms",
      };
      panel("Market stall", "/explore/market/" + shops[id.slice(5)]);
      return;
    }
    const paths = {
      shops: "/shops",
      noticeboard: "/community/events",
      "arcade-game": "/explore/arcade",
      trading: "/trading/lab",
      portfolio: "/trading/portfolio",
      "trade-history": "/trading/portfolio",
      competitions: "/trading/competitions",
      leaderboard: "/leaderboard",
      research: "/research",
      memories: world.activeMochi ? "/mochi/" + world.activeMochi.id : "/home",
      rest: null,
      play: null,
    };
    if (id === "rest") care("sleep");
    else if (id === "play") care("play");
    else if (id === "sit" || id.startsWith("sit:")) {
      bridge.send("emote", { emote: "sit" });
      const self = players.get(bridge.selfId);
      bridge.scene.bubbles.say(
        "player:" + bridge.selfId,
        bridge.scene.players.get(bridge.selfId)?.root,
        "Taking a little break.",
      );
    } else if (paths[id]) panel("Explore", paths[id]);
  }
  async function care(kind) {
    await refresh();
    const id = world.activeMochi?.id;
    if (!id) {
      showNotice("Select or adopt a companion first.");
      return;
    }
    let itemId;
    if (kind === "feed" || kind === "play") {
      const choices = world.inventory.filter(
        (i) =>
          i.location === "bag" &&
          i.quantity > 0 &&
          i.item.category === (kind === "feed" ? "food" : "toy"),
      );
      if (!choices.length) {
        showNotice(
          "Find a " +
            (kind === "feed" ? "snack at the Café." : "toy at the Market."),
        );
        return;
      }
      const d = dialog(kind === "feed" ? "Choose a snack" : "Choose a toy");
      for (const i of choices)
        d.append(
          btn(`${i.item.name} · ${i.quantity}`, async () => {
            await request("/api/care", {
              mochiId: id,
              kind,
              itemId: i.item.id,
            });
            d.close();
            await refresh();
          }),
        );
      return;
    }
    await request("/api/care", { mochiId: id, kind, itemId });
    await refresh();
  }
  const chooseCompanion = companionPicker({ refresh, request, dialog, element, btn, panel,
    isClosed: () => closed || tearingDown, notice: showNotice });
  async function customizeAvatar() {
    const avatar = await request("/api/avatar");
    await refresh();
    const d = dialog("Your adventurer"),
      form = element("form");
    const name = element("input");
    name.value = avatar.display_name;
    name.maxLength = 24;
    name.setAttribute("aria-label", "Character display name");
    const color = element("input");
    color.type = "color";
    color.value = avatar.body_color;
    color.setAttribute("aria-label", "Clothing color");
    const style = element("select");
    style.setAttribute("aria-label", "Character style");
    style.append(
      new Option("Chestnut · sage villager", "classic"),
      new Option("Dark curls · coral villager", "curly"),
    );
    style.value = avatar.appearance?.style ?? "classic";
    const save = element("button", "Save appearance");
    save.type = "submit";
    form.append(
      element("label", "Your name"),
      name,
      element("label", "Clothing color"),
      color,
      element("label", "Character style"),
      style,
      save,
    );
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await request("/api/avatar", {
          displayName: name.value,
          bodyColor: color.value,
          style: style.value,
        });
        d.close();
      } catch (e) {
        showNotice(e.message);
      }
    };
    d.append(form, element("p", "Cosmetics use clothing already in your bag."));
    for (const slot of [
      "hat",
      "face",
      "top",
      "back",
      "hand",
      "feet",
      "accessory",
    ]) {
      const label = element("label", slot),
        select = element("select");
      select.setAttribute("aria-label", slot + " cosmetic");
      select.append(new Option("None", ""));
      for (const i of world.inventory.filter(
        (i) =>
          i.location === "bag" &&
          i.quantity > 0 &&
          i.item.category === "clothing",
      ))
        select.append(new Option(i.item.name, i.item.id));
      select.value = avatar.equipment[slot] ?? "";
      select.onchange = async () => {
        try {
          await request("/api/avatar", { slot, itemId: select.value });
        } catch (e) {
          showNotice(e.message);
        }
      };
      d.append(label, select);
    }
    if (config.development) {
      const info = element("details"),
        summary = element("summary", "Development details");
      info.append(
        summary,
        element(
          "p",
          `Room ${currentRoom} · socket ${status.textContent} · ${world.activeMochi?.name ?? "no companion"} · persistent Cadence checkpoint · dialogue ${config.dialogueProvider} · ${world.currency.network} · mint ${world.currency.mint}`,
        ),
      );
      d.append(info);
      const diagnostic = await request("/api/debug/social");
      const pre = element("pre", JSON.stringify(diagnostic, null, 2));
      info.append(pre);
    }
    if (config.authentication)
      d.append(btn("Sign out on all devices", async () => {
        await request("/api/auth/logout", {});
        location.assign("/home");
      }));
    if (config.development) {
      const loginInput = element("input");
      loginInput.placeholder = "Development username";
      loginInput.setAttribute("aria-label", "Development username");
      d.append(
        loginInput,
        btn("Switch development account", async () => {
          await request("/api/dev/login", { username: loginInput.value });
          location.reload();
        }),
      );
    }
    d.append(
      btn("Original pet home", () => panel("Mochi home", "/room")),
      btn("Treasury transparency", () => panel("Treasury", "/treasury")),
    );
  }
  async function talkPanel() {
    await refresh();
    if (!world.activeMochi) {
      showNotice("Choose a companion first.");
      return;
    }
    openConversation({ pet: world.activeMochi, bridge, refresh });
  }
  adventure = adventureUI({
    chooseCompanion,
    openTokenShop: (id) => panel("Optional token market", "/explore/market/" + id),
    shell,
    bridge,
    request,
    dialog,
    btn,
    element,
    notice: showNotice,
    refresh,
  });
  const game = await mountIsometric(canvas, bridge, config);
  const panelMessage = async (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== "worldRoom")
      return;
    if (!ROOMS.some((r) => r.id === String(e.data.roomId).split(":")[0]))
      return;
    try {
      for (const d of document.querySelectorAll(".world-dialog"))
        await d.requestClose?.();
      bridge.join(e.data.roomId);
    } catch (error) {
      showNotice(error.message);
    }
  };
  window.addEventListener("message", panelMessage);
  const activity = () =>
    bridge.send("presence", { status: document.hidden ? "away" : "online" });
  document.addEventListener("visibilitychange", activity);
  await refresh();
  const stopOverlayLayout = observeOverlayLayout(shell);
  const refreshTimer = setInterval(() => refresh().catch(() => {}), 30000);
  return async () => {
    tearingDown = true;
    try {
      for (const d of document.querySelectorAll(".world-dialog"))
        await d.requestClose?.();
    } catch (error) {
      tearingDown = false;
      throw error;
    }
    closed = true;
    clearInterval(refreshTimer);
    clearTimeout(reconnectTimer);
    document.removeEventListener("visibilitychange", activity);
    window.removeEventListener("message", panelMessage);
    socket?.close();
    adventure.destroy();
    stopOverlayLayout();
    game.destroy(true);
    document.body.classList.remove("playing-world");
    for (const d of document.querySelectorAll(".world-dialog")) d.close();
  };
}
