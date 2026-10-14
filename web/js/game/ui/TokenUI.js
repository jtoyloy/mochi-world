const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  return e;
};
const api = async (path, data) => {
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
  if (!r.ok) throw new Error(b.error ?? "Try again");
  return b;
};
function encode58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let text = "";
  while (n > 0n) {
    text = alphabet[Number(n % 58n)] + text;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    text = "1" + text;
  }
  return text;
}
function button(text, fn, status) {
  const b = node("button", text);
  b.onclick = async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      if (status) status.textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
export async function tokenCheckout(data) {
  const intent = await api("/api/token/intent", data);
  const d = node("dialog"),
    status = node("p");
  d.className = "world-dialog";
  const amount = node(
    "p",
    `${intent.formatted} ${intent.mock ? "TEST $MOCHI" : "$MOCHI"}`,
  );
  amount.className = "payment-amount";
  d.append(
    node("h2", "A little treasure"),
    amount,
    node(
      "p",
      intent.mock
        ? "Fake development currency. No wallet or blockchain funds are used."
        : `User-signed payment on ${intent.network}. Items are delivered by this game server after independent payment verification.`,
    ),
    status,
  );
  let complete = false;
  if (intent.mock)
    d.append(
      button(
        "Confirm test purchase",
        async () => {
          const answer = await api("/api/token/verify", {
            intentId: intent.id,
          });
          complete = true;
          status.textContent = answer.message;
          setTimeout(() => d.close(), 1000);
        },
        status,
      ),
    );
  else {
    const transfer = new URL("solana:" + intent.recipient);
    transfer.searchParams.set("amount", intent.formatted);
    transfer.searchParams.set("spl-token", intent.mint);
    transfer.searchParams.set("memo", intent.memo);
    transfer.searchParams.set("label", "Mochi World");
    transfer.searchParams.set("message", "Purchase an in-game item");
    const link = node("a", "Open payment in your wallet");
    link.href = transfer.toString();
    link.className = "button";
    d.append(
      link,
      node(
        "p",
        `Set your wallet to ${intent.network}. Sign only the displayed amount and recipient. Network fees are paid in SOL.`,
      ),
    );
    const info = node("details"),
      summary = node("summary", "Payment details");
    info.append(
      summary,
      node("p", `Mint: ${intent.mint}`),
      node("p", `Recipient: ${intent.recipient}`),
      node("p", `Memo: ${intent.memo}`),
    );
    d.append(info);
    const signature = node("input");
    signature.placeholder = "Confirmed transaction signature";
    signature.setAttribute("aria-label", "Payment transaction signature");
    let paymentVerified = false;
    const verify = button(
        "Verify & deliver item",
        async () => {
          const existingSignature = signature.value.trim();
          if (!paymentVerified && !existingSignature)
            throw new Error("Paste the signature of the payment you already sent.");
          // Once verifying an existing transfer, keep retries on that transfer
          // even if the response is lost after the server records payment.
          link.remove();
          const result = await api("/api/token/verify", {
            intentId: intent.id,
            ...(paymentVerified ? {} : { signature: existingSignature }),
          });
          paymentVerified = true;
          complete = true;
          link.remove();
          signature.remove();
          if (result.status === "verified") verify.textContent = "Retry item delivery";
          else verify.remove();
          status.textContent = result.message;
        },
        status,
      );
    d.append(signature, verify);
  }
  if (!intent.mock)
    d.append(node("p", "You can close this window and recover an existing payment from your wallet page."));
  d.append(button(intent.mock ? "Cancel checkout" : "Close checkout", () => d.close(), status));
  document.body.append(d);
  d.onclose = () => {
    if (!complete && intent.mock)
      api("/api/token/cancel", { intentId: intent.id }).catch(() => {});
    d.remove();
  };
  d.showModal();
  return new Promise((resolve) =>
    d.addEventListener("close", resolve, { once: true }),
  );
}
export async function paymentRecovery(app, { request = api, element = node, control = button } = {}) {
  const section = element("section"), entries = element("div"), status = element("p");
  const loading = "Loading open checkouts…";
  status.textContent = loading;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  section.append(element("h2", "Open token checkouts"),
    element("p", "Verify a payment already sent, or retry delivery of a verified purchase."), entries, status);
  app.append(section);
  let nextCursor = null;
  const load = async (after = null) => {
    const page = await request("/api/token/payments" + (after ? "?after=" + encodeURIComponent(after) : ""));
    if (!after) entries.replaceChildren();
    for (const payment of page.payments) {
      const mock = payment.mock ?? page.mock;
      const row = element("article"), feedback = element("p");
      feedback.setAttribute("role", "status");
      row.append(element("h3", `${payment.quantity} ${payment.itemName}`),
        element("p", `${payment.formatted} ${mock ? "TEST $MOCHI" : "$MOCHI"}`),
        element("p", "Opened " + new Date(payment.createdAt).toLocaleString()),
        element("p", payment.message), feedback);
      if (payment.canRetry) {
        let signature;
        if (payment.requiresSignature) {
          signature = element("input");
          signature.setAttribute("aria-label", `Existing payment signature for ${payment.itemName}`);
          signature.placeholder = "Confirmed transaction signature";
          row.append(signature);
        }
        row.append(control(payment.requiresSignature ? "Verify existing payment" : mock ? "Complete test checkout" : "Retry item delivery", async () => {
          const result = await request("/api/token/verify", {
            intentId: payment.id,
            ...(signature ? { signature: signature.value.trim() } : {}),
          });
          status.textContent = result.message;
          await load();
        }, feedback));
      }
      entries.append(row);
    }
    nextCursor = page.nextCursor;
    more.hidden = !nextCursor;
    if (!entries.children.length) entries.append(element("p", "No open token checkouts."));
    if (status.textContent === loading) status.textContent = "";
  };
  const more = control("Load more checkouts", () => { status.textContent = loading; return load(nextCursor); }, status);
  more.hidden = true;
  section.append(control("Refresh checkouts", () => { status.textContent = loading; return load(); }, status), more);
  try { await load(); }
  catch (error) { status.textContent = error.message; }
}
export async function walletPage(app) {
  const balance = await api("/api/token/balance");
  app.append(
    node("h1", "Your wallet"),
    node(
      "p",
      `${balance.formatted} ${balance.mock ? "TEST $MOCHI — fake development currency" : "$MOCHI"}`,
    ),
    node(
      "p",
      `Network: ${balance.network}. Wallets are linked to your game account, not used as your player identity.`,
    ),
  );
  const status = node("p");
  status.setAttribute("role", "status");
  app.append(status);
  for (const key of balance.wallets)
    app.append(node("p", "Verified wallet: " + key));
  app.append(
    button(
      "Connect & prove wallet ownership",
      async () => {
        const provider = window.phantom?.solana ?? window.solana;
        if (!provider?.connect || !provider?.signMessage)
          throw new Error(
            "Open this page in a browser with a Solana wallet. Linking uses a signature, never a seed phrase.",
          );
        const connection = await provider.connect(),
          publicKey = connection.publicKey.toString();
        const proof = await api("/api/wallet/challenge", { publicKey });
        const signed = await provider.signMessage(
          new TextEncoder().encode(proof.message),
          "utf8",
        );
        const result = await api("/api/wallet/link", {
          challengeId: proof.id,
          signature: encode58(signed.signature),
        });
        status.textContent = result.message;
      },
      status,
    ),
    button(
      "Refresh balance",
      async () => {
        const b = await api("/api/token/balance?refresh");
        status.textContent = `${b.formatted} ${b.mock ? "TEST $MOCHI" : "$MOCHI"}`;
      },
      status,
    ),
  );
  app.append(
    node(
      "p",
      balance.mock
        ? "The existing balance was imported once into a separate test-token ledger. Test purchases and test rewards never represent on-chain $MOCHI."
        : "On-chain balances are authoritative. Refresh uses the server RPC cache. Game rewards are not automatic token transfers.",
    ),
  );
  await paymentRecovery(app);
}
export async function treasuryPage(app) {
  const state = await api("/api/treasury");
  app.append(
    node("h1", "Treasury transparency"),
    node(
      "p",
      state.buybackBps === null
        ? "No buyback percentage is configured."
        : `${state.buybackBps} basis points of qualifying platform revenue are allocated to the disclosed $CADENCE policy.`,
    ),
    node("p", state.execution),
    node(
      "p",
      "Player-to-player gross volume is not platform revenue. Mock records are not actual revenue or burns.",
    ),
  );
  const records = node("section");
  records.append(node("h2", "Eligible revenue & allocations"));
  if (!state.records.length)
    records.append(node("p", "No recorded platform revenue yet."));
  for (const r of state.records) {
    const row = node(
      "p",
      `${r.mock ? "MOCK ONLY · " : ""}${r.source} · ${r.amount_raw} base units · allocation ${r.allocation_raw ?? "unset"} · ${r.token_mint}`,
    );
    records.append(row);
  }
  app.append(records, node("h2", "Verified buybacks & burns"));
  if (!state.burns.length)
    app.append(node("p", "No verified buybacks or burns."));
  for (const burn of state.burns) {
    const row = node("article");
    row.append(node("p", `${burn.burned_raw} $CADENCE base units burned`));
    for (const sig of [burn.dex_signature, burn.burn_signature]) {
      const a = node("a", sig);
      a.href = `https://explorer.solana.com/tx/${encodeURIComponent(sig)}${state.network === "devnet" ? "?cluster=devnet" : ""}`;
      a.target = "_blank";
      a.rel = "noopener";
      row.append(a);
    }
    app.append(row);
  }
}
