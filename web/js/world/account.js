export function accountGate(host, { request, ready }) {
  let register = false;
  function render() {
    const panel = document.createElement("section");
    panel.className = "card account-gate";
    const title = document.createElement("h1");
    title.textContent = register ? "Begin your adventure" : "Welcome to Mochi World";
    const copy = document.createElement("p");
    copy.textContent = "Explore, gather and meet your Mochi. No wallet is needed to play.";
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
    toggle.onclick = () => { register = !register; render(); };
    form.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = toggle.disabled = true;
      error.textContent = "";
      try {
        await request(register ? "/api/auth/register" : "/api/auth/login", {
          username: fields.username.value, password: fields.password.value,
        });
        fields.password.value = "";
        await ready();
      } catch (failure) {
        error.textContent = failure.message;
        fields.password.value = "";
        fields.password.focus();
      } finally { submit.disabled = toggle.disabled = false; }
    };
    form.append(hint, error, submit, toggle);
    panel.append(title, copy, form);
    host.replaceChildren(panel);
    fields.username.focus();
  }
  render();
}
