export function accountGate(host, { request, ready, recovering = false }) {
  let register = false;
  function render() {
    const panel = document.createElement("section");
    panel.className = "card account-gate";
    const title = document.createElement("h1");
    title.textContent = recovering ? "Sign in to recover your room" : register ? "Begin your adventure" : "Welcome to Mochi World";
    const copy = document.createElement("p");
    copy.textContent = recovering
      ? "Your open room and unsaved brain are retained. Sign in to the same account, then retry saving before continuing. Keep this page open."
      : "Explore, gather and meet your Mochi. No wallet is needed to play.";
    const form = document.createElement("form");
    const fields = {};
    for (const [name, label, type, autocomplete] of [
      ["username", "Username", "text", "username"],
      ["password", "Password", "password", register ? "new-password" : "current-password"],
    ]) {
      const caption = document.createElement("label");
      caption.textContent = label;
      const input = document.createElement("input");
      input.id = "account-" + name;
      input.name = name;
      input.type = type;
      input.autocomplete = autocomplete;
      input.required = true;
      input.minLength = name === "password" ? 12 : 3;
      input.maxLength = name === "password" ? 128 : 24;
      if (name === "username") { input.pattern = "[a-z0-9_-]{3,24}"; input.autocapitalize = "none"; }
      caption.htmlFor = input.id;
      fields[name] = input;
      form.append(caption, input);
    }
    const hint = document.createElement("p");
    hint.textContent = "Username: lowercase letters, numbers, underscores or hyphens. Password: at least 12 characters.";
    hint.id = "account-hint";
    for (const input of Object.values(fields)) input.setAttribute("aria-describedby", hint.id);
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = register ? "Create account" : "Sign in";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = register ? "Already have an account? Sign in" : "New here? Create an account";
    toggle.hidden = recovering;
    toggle.onclick = () => { register = !register; render(); };
    let authenticated;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Retry saving and continue";
    retry.hidden = true;
    async function resume() {
      await ready(authenticated);
    }
    retry.onclick = async () => {
      submit.disabled = toggle.disabled = retry.disabled = true;
      error.textContent = "";
      try { await resume(); }
      catch (failure) { error.textContent = failure.message; retry.hidden = !!failure.accountMismatch; }
      finally { submit.disabled = toggle.disabled = retry.disabled = false; }
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = toggle.disabled = retry.disabled = true;
      retry.hidden = true;
      authenticated = null;
      error.textContent = "";
      try {
        authenticated = await request(register ? "/api/auth/register" : "/api/auth/login", {
          username: fields.username.value, password: fields.password.value,
        });
        fields.password.value = "";
        await resume();
      } catch (failure) {
        error.textContent = failure.message;
        retry.hidden = !authenticated || !!failure.accountMismatch;
        fields.password.value = "";
        fields.password.focus();
      } finally { submit.disabled = toggle.disabled = retry.disabled = false; }
    };
    form.append(hint, error, submit, toggle, retry);
    panel.append(title, copy, form);
    host.replaceChildren(panel);
    fields.username.focus();
  }
  render();
}
