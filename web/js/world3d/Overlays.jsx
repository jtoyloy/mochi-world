import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { restoreDialogInvoker } from "../game/dialog-focus.js";
const request = async (path, data) => {
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
  if (!r.ok) throw Error(b.error ?? "Please try again");
  return b;
};
function Window({ title, close, children }) {
  const [closing, setClosing] = useState(false);
  const requestClose = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await close();
    } finally {
      setClosing(false);
    }
  };
  return (
    <>
      <h2>{title}</h2>
      <button
        className="dialog-close"
        disabled={closing}
        onClick={requestClose}
      >
        Close
      </button>
      {children}
    </>
  );
}
export function reactDialog(title, render, { beforeClose, invoker = document.activeElement } = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = "world-dialog react-game-panel";
  document.body.append(dialog);
  const root = createRoot(dialog);
  dialog.requestClose = async () => {
    await beforeClose?.(dialog);
    dialog.close();
  };
  const close = () =>
    dialog.requestClose().catch((e) => {
      let error = dialog.querySelector(".panel-save-error");
      if (!error) {
        error = document.createElement("p");
        error.className = "panel-save-error";
        error.setAttribute("role", "alert");
        dialog.append(error);
      }
      error.textContent = e.message;
    });
  dialog.onclose = () => {
    root.unmount();
    dialog.remove();
  };
  dialog.oncancel = (e) => {
    e.preventDefault();
    close();
  };
  restoreDialogInvoker(dialog, invoker);
  root.render(
    <Window title={title} close={close}>
      {render(close)}
    </Window>,
  );
  dialog.showModal();
  return dialog;
}
export function openConversation({ pet, bridge, refresh, invoker }) {
  return reactDialog("Talk with " + pet.name, (close) => (
    <Conversation pet={pet} bridge={bridge} refresh={refresh} />
  ), { invoker });
}
function Conversation({ pet, bridge }) {
  const [history, setHistory] = useState([]),
    [message, setMessage] = useState(""),
    [publicReply, setPublic] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    request("/api/dialogue/" + pet.id)
      .then((h) => {
        if (live) setHistory(h);
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, [pet.id]);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const text = message;
    setMessage("");
    setHistory((h) => [...h, { role: "user", text }]);
    try {
      const answer = await request("/api/dialogue", {
        mochiId: pet.id,
        message: text,
        visibility: publicReply ? "room" : "owner_only",
      });
      setHistory((h) => [...h, { role: "assistant", text: answer.text }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="panel-subtitle">
        A little time together · private by default
      </p>
      <div className="conversation-history" aria-live="polite">
        {history.map((m, i) => (
          <p
            key={i}
            className={m.role === "user" ? "from-owner" : "from-mochi"}
          >
            <small>{m.role === "user" ? "You" : pet.name}</small>
            <span>{m.text}</span>
          </p>
        ))}
      </div>
      <form onSubmit={submit}>
        <input
          aria-label="Message to your Mochi"
          placeholder="Say something to your Mochi…"
          maxLength={400}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button disabled={busy || !message.trim()}>
          {busy ? "Thinking…" : "Send"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={publicReply}
            onChange={(e) => setPublic(e.target.checked)}
          />
          Share this reply with the room
        </label>
      </form>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function openBackpack({ world, refresh, notice, openLegacy, invoker }) {
  return reactDialog("Your backpack", (close) => (
    <Backpack
      initial={world}
      refresh={refresh}
      notice={notice}
      openLegacy={openLegacy}
    />
  ), { invoker });
}
function Backpack({ initial, refresh, notice, openLegacy }) {
  const [world, setWorld] = useState(initial),
    [category, setCategory] = useState("all"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(i, kind) {
    setBusy(true);
    setError("");
    try {
      if (kind === "feed" || kind === "play") {
        if (!world.activeMochi) throw Error("Choose a companion first");
        await request("/api/care", {
          mochiId: world.activeMochi.id,
          kind,
          itemId: i.item.id,
        });
      } else if (kind === "place") {
        if (!world.activeMochi) throw Error("Choose a companion first");
        await request("/api/equip", {
          mochiId: world.activeMochi.id,
          itemId: i.item.id,
        });
        openHomeEditor(world.activeMochi);
      } else if (kind === "equip") {
        await request("/api/avatar", { slot: "hat", itemId: i.item.id });
      }
      setWorld(await refresh());
      notice("A little update, saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = world.inventory.filter(
    (i) =>
      i.location === "bag" &&
      i.quantity > 0 &&
      (category === "all" || i.item.category === category),
  );
  return (
    <>
      <p className="panel-subtitle">
        Little treasures for you and your companion
      </p>
      <div className="inventory-tabs">
        {["all", "food", "toy", "clothing", "furniture", "collectible"].map(
          (c) => (
            <button
              key={c}
              className={category === c ? "selected" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ),
        )}
      </div>
      <div className="backpack-grid">
        {rows.map((i) => (
          <article key={i.item.id} className="inventory-tile">
            <div className={"item-illustration " + i.item.category}>
              {i.item.category === "food"
                ? "🍙"
                : i.item.category === "toy"
                  ? "🧶"
                  : i.item.category === "clothing"
                    ? "🧢"
                    : i.item.category === "furniture"
                      ? "🪑"
                      : "✦"}
            </div>
            <h3>{i.item.name}</h3>
            <small>
              {i.item.rarity ?? "Everyday"} · ×{i.quantity}
            </small>
            <p>{i.item.description}</p>
            {["food", "toy", "clothing", "furniture"].includes(
              i.item.category,
            ) && (
              <button
                disabled={busy}
                onClick={() =>
                  action(
                    i,
                    i.item.category === "food"
                      ? "feed"
                      : i.item.category === "toy"
                        ? "play"
                        : i.item.category === "furniture"
                          ? "place"
                          : "equip",
                  )
                }
              >
                {i.item.category === "food"
                  ? "Feed"
                  : i.item.category === "toy"
                    ? "Play"
                    : i.item.category === "furniture"
                      ? "Place"
                      : "Wear as hat"}
              </button>
            )}
            <button onClick={event => openLegacy("/items/inventory", event.currentTarget)}>
              Inspect / gift / sell
            </button>
          </article>
        ))}
      </div>
      {!rows.length && (
        <p>No treasures in this pocket yet. Visit the Market.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}

export function openHomeEditor(pet) {
  return reactDialog("Make room for a little treasure", (close) => (
    <HomeEditor pet={pet} />
  ));
}
function HomeEditor({ pet }) {
  const [home, setHome] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    request("/api/world").then((w) =>
      setHome(w.mochis.find((p) => p.id === pet.id)),
    );
  }, [pet.id]);
  const slots = home?.profile?.homeSlots ?? {};
  async function place(slot, snap) {
    try {
      await request("/api/home/place", { mochiId: pet.id, slot, snap });
      setError("Position saved. Visit your home to see it.");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <p>
        Six display points along the north wall keep your walking path clear.
      </p>
      {Object.keys(slots).map((slot) => (
        <div key={slot}>
          <h3>{slots[slot]}</h3>
          <div className="inventory-tabs">
            {[0, 1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => place(slot, s)}>
                Point {s + 1}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!Object.keys(slots).length && (
        <p>Place a furniture item from your backpack first.</p>
      )}
      {error && <p role="status">{error}</p>}
    </>
  );
}

export function openDomainPanel(title, url, invoker = document.activeElement) {
  return reactDialog(
    title,
    () => (
      <iframe
        className="world-web-panel"
        title={title}
        src={url + (url.includes("?") ? "&" : "?") + "panel=1"}
      />
    ),
    {
      invoker,
      beforeClose: async (dialog) => {
        const frame = dialog.querySelector("iframe");
        const nested =
          frame.contentWindow?.document.querySelector(
            ".room-frame",
          )?.contentWindow;
        const mochi = nested?.mochi;
        if (mochi) {
          if ((await mochi.save(false)) === false)
            throw Error(
              "The brain could not save. Keep this panel open and retry.",
            );
          await mochi.releaseRoom?.();
        }
      },
    },
  );
}
