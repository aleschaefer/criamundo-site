const ADMIN_PASSWORD_HASH =
  "dc3d66e03f6b54589e1b4eec25a08049383d5a01c4c9a6fbeaf9b864016957c1";
const ADMIN_SESSION_KEY = "rio2c-admin-session";
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_COOLDOWN_MS = 60 * 1000;

let adminData = loadSiteData();
let failedLoginAttempts = 0;
let loginCooldownUntil = 0;

const body = document.body;
const authShell = document.querySelector("#auth-shell");
const adminShell = document.querySelector("#admin-shell");
const loginForm = document.querySelector("#login-form");
const passwordField = document.querySelector("#admin-password");
const authStatus = document.querySelector("#auth-status");
const logoutButton = document.querySelector("#logout-admin");
const form = document.querySelector("#admin-form");
const groupsEditor = document.querySelector("#groups-editor");
const saveStatus = document.querySelector("#save-status");
const exportButton = document.querySelector("#export-json");
const resetButton = document.querySelector("#reset-data");
const addGroupButton = document.querySelector("#add-group");

function createEmptyProject() {
  return {
    title: "",
    format: "",
    genre: "",
    logline: "",
    status: "",
    audience: ""
  };
}

function createEmptyGroup() {
  return {
    category: "Nova categoria",
    items: [createEmptyProject()]
  };
}

function moveItem(array, fromIndex, toIndex) {
  if (
    !Array.isArray(array) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= array.length ||
    toIndex >= array.length ||
    fromIndex === toIndex
  ) {
    return;
  }

  const [item] = array.splice(fromIndex, 1);
  array.splice(toIndex, 0, item);
}

function normalizePosition(value, listLength) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(Math.max(Math.floor(parsed) - 1, 0), Math.max(listLength - 1, 0));
}

function setSaveStatus(message, type = "") {
  saveStatus.textContent = message;
  saveStatus.className = `save-status${type ? ` is-${type}` : ""}`;
}

function setAuthStatus(message, type = "") {
  authStatus.textContent = message;
  authStatus.className = `auth-status${type ? ` is-${type}` : ""}`;
}

function updateAuthView(isAuthenticated) {
  body.classList.toggle("is-locked", !isAuthenticated);
  body.classList.toggle("is-unlocked", isAuthenticated);
  adminShell.hidden = !isAuthenticated;
  authShell.hidden = isAuthenticated;
}

function persistAuthenticatedSession() {
  sessionStorage.setItem(ADMIN_SESSION_KEY, "authenticated");
}

function clearAuthenticatedSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

function isAuthenticated() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "authenticated";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function hashText(value) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function isValidPassword(password) {
  const passwordHash = await hashText(password);
  return passwordHash === ADMIN_PASSWORD_HASH;
}

function applyLoginCooldown() {
  const remainingMs = loginCooldownUntil - Date.now();
  if (remainingMs <= 0) {
    passwordField.disabled = false;
    return;
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  passwordField.disabled = true;
  setAuthStatus(
    `Muitas tentativas. Aguarde ${remainingSeconds}s para tentar novamente.`,
    "error"
  );

  window.setTimeout(applyLoginCooldown, 1000);
}

function fillTopFields() {
  form.elements["contact.email"].value = adminData.siteConfig.contact.email || "";
  form.elements["contact.whatsapp"].value =
    adminData.siteConfig.contact.whatsapp || "";
  form.elements["contact.instagram"].value =
    adminData.siteConfig.contact.instagram || "";
  form.elements["challenge.endpoint"].value =
    adminData.siteConfig.challengeForm.endpoint || "";
  form.elements["challenge.accessKey"].value =
    adminData.siteConfig.challengeForm.accessKey || "";
  form.elements["challenge.fallbackSubject"].value =
    adminData.siteConfig.challengeForm.fallbackSubject || "";
  form.elements["challenge.subject"].value =
    adminData.siteConfig.challengeForm.subject || "";
  form.elements["challenge.fromName"].value =
    adminData.siteConfig.challengeForm.fromName || "";
  form.elements["challenge.successMessage"].value =
    adminData.siteConfig.challengeForm.successMessage || "";

  form.elements["featured.title"].value = adminData.featuredProject.title || "";
  form.elements["featured.format"].value = adminData.featuredProject.format || "";
  form.elements["featured.genre"].value = adminData.featuredProject.genre || "";
  form.elements["featured.status"].value = adminData.featuredProject.status || "";
  form.elements["featured.audience"].value =
    adminData.featuredProject.audience || "";
  form.elements["featured.logline"].value =
    adminData.featuredProject.logline || "";
}

function renderGroups() {
  groupsEditor.innerHTML = adminData.projectGroups
    .map(
      (group, groupIndex) => `
        <section class="group-shell" data-group-index="${groupIndex}">
          <div class="group-header">
            <div>
              <p class="eyebrow">Categoria ${groupIndex + 1}</p>
              <h3>${group.category || "Nova categoria"}</h3>
              <p class="group-count">${group.items.length} projetos nesta secao</p>
            </div>
            <div class="order-actions">
              <label class="order-label">
                Posicao
                <input
                  class="order-input"
                  type="number"
                  min="1"
                  max="${adminData.projectGroups.length}"
                  value="${groupIndex + 1}"
                  data-action="move-group-to"
                  data-group-index="${groupIndex}"
                />
              </label>
              <button class="button button-secondary" type="button" data-action="move-group-up" data-group-index="${groupIndex}">
                Subir
              </button>
              <button class="button button-secondary" type="button" data-action="move-group-down" data-group-index="${groupIndex}">
                Descer
              </button>
              <button class="button button-danger" type="button" data-action="remove-group" data-group-index="${groupIndex}">
                Remover categoria
              </button>
            </div>
          </div>

          <div class="group-body">
            <label>
              Nome da categoria
              <input type="text" data-field="group-category" data-group-index="${groupIndex}" value="${escapeHtml(
                group.category || ""
              )}" />
            </label>

            <div class="project-list">
              ${group.items
                .map(
                  (item, projectIndex) => `
                    <article class="project-editor">
                      <div class="project-header">
                        <div>
                          <p class="eyebrow">Projeto ${projectIndex + 1}</p>
                          <h3>${item.title || "Novo projeto"}</h3>
                        </div>
                        <div class="order-actions">
                          <label class="order-label">
                            Posicao
                            <input
                              class="order-input"
                              type="number"
                              min="1"
                              max="${group.items.length}"
                              value="${projectIndex + 1}"
                              data-action="move-project-to"
                              data-group-index="${groupIndex}"
                              data-project-index="${projectIndex}"
                            />
                          </label>
                          <button class="button button-secondary" type="button" data-action="move-project-up" data-group-index="${groupIndex}" data-project-index="${projectIndex}">
                            Subir
                          </button>
                          <button class="button button-secondary" type="button" data-action="move-project-down" data-group-index="${groupIndex}" data-project-index="${projectIndex}">
                            Descer
                          </button>
                          <button class="button button-danger" type="button" data-action="remove-project" data-group-index="${groupIndex}" data-project-index="${projectIndex}">
                            Remover projeto
                          </button>
                        </div>
                      </div>

                      <div class="project-body">
                        <div class="grid grid-2">
                          <label>
                            Titulo
                            <input type="text" data-field="title" data-group-index="${groupIndex}" data-project-index="${projectIndex}" value="${escapeHtml(
                              item.title || ""
                            )}" />
                          </label>
                          <label>
                            Formato
                            <input type="text" data-field="format" data-group-index="${groupIndex}" data-project-index="${projectIndex}" value="${escapeHtml(
                              item.format || ""
                            )}" />
                          </label>
                          <label>
                            Genero
                            <input type="text" data-field="genre" data-group-index="${groupIndex}" data-project-index="${projectIndex}" value="${escapeHtml(
                              item.genre || ""
                            )}" />
                          </label>
                          <label>
                            Status
                            <input type="text" data-field="status" data-group-index="${groupIndex}" data-project-index="${projectIndex}" value="${escapeHtml(
                              item.status || ""
                            )}" />
                          </label>
                          <label class="full-width">
                            Publico-alvo
                            <input type="text" data-field="audience" data-group-index="${groupIndex}" data-project-index="${projectIndex}" value="${escapeHtml(
                              item.audience || ""
                            )}" />
                          </label>
                        </div>
                        <label>
                          Logline
                          <textarea rows="4" data-field="logline" data-group-index="${groupIndex}" data-project-index="${projectIndex}">${escapeHtml(
                            item.logline || ""
                          )}</textarea>
                        </label>
                      </div>
                    </article>
                  `
                )
                .join("")}
            </div>

            <div class="muted-button-row">
              <button class="button button-secondary" type="button" data-action="add-project" data-group-index="${groupIndex}">
                Adicionar projeto
              </button>
            </div>
          </div>
        </section>
      `
    )
    .join("");
}

function syncTopFieldsToState() {
  adminData.siteConfig.contact.email = form.elements["contact.email"].value.trim();
  adminData.siteConfig.contact.whatsapp =
    form.elements["contact.whatsapp"].value.trim();
  adminData.siteConfig.contact.instagram =
    form.elements["contact.instagram"].value.trim();

  adminData.siteConfig.challengeForm.endpoint =
    form.elements["challenge.endpoint"].value.trim();
  adminData.siteConfig.challengeForm.accessKey =
    form.elements["challenge.accessKey"].value.trim();
  adminData.siteConfig.challengeForm.fallbackSubject =
    form.elements["challenge.fallbackSubject"].value.trim();
  adminData.siteConfig.challengeForm.subject =
    form.elements["challenge.subject"].value.trim();
  adminData.siteConfig.challengeForm.fromName =
    form.elements["challenge.fromName"].value.trim();
  adminData.siteConfig.challengeForm.successMessage =
    form.elements["challenge.successMessage"].value.trim();

  adminData.featuredProject.title = form.elements["featured.title"].value.trim();
  adminData.featuredProject.format =
    form.elements["featured.format"].value.trim();
  adminData.featuredProject.genre = form.elements["featured.genre"].value.trim();
  adminData.featuredProject.status =
    form.elements["featured.status"].value.trim();
  adminData.featuredProject.audience =
    form.elements["featured.audience"].value.trim();
  adminData.featuredProject.logline =
    form.elements["featured.logline"].value.trim();
}

function downloadJsonFile(filename, contents) {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (Date.now() < loginCooldownUntil) {
    applyLoginCooldown();
    return;
  }

  const password = passwordField.value;
  const validPassword = await isValidPassword(password);

  if (!validPassword) {
    failedLoginAttempts += 1;
    passwordField.value = "";

    if (failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      loginCooldownUntil = Date.now() + LOGIN_COOLDOWN_MS;
      failedLoginAttempts = 0;
      applyLoginCooldown();
      return;
    }

    setAuthStatus("Senha incorreta. Tente novamente.", "error");
    return;
  }

  failedLoginAttempts = 0;
  loginCooldownUntil = 0;
  passwordField.disabled = false;
  persistAuthenticatedSession();
  updateAuthView(true);
  setAuthStatus("");
  passwordField.value = "";
  setSaveStatus("Painel liberado para edicao.", "success");
});

logoutButton.addEventListener("click", () => {
  clearAuthenticatedSession();
  updateAuthView(false);
  passwordField.value = "";
  passwordField.disabled = false;
  setAuthStatus("Sessao encerrada.", "success");
  setSaveStatus("");
});

groupsEditor.addEventListener("input", (event) => {
  const target = event.target;
  const groupIndex = Number(target.dataset.groupIndex);
  const projectIndex = target.dataset.projectIndex;
  const field = target.dataset.field;

  if (field === "group-category") {
    adminData.projectGroups[groupIndex].category = target.value;
    renderGroups();
    return;
  }

  if (projectIndex !== undefined && field) {
    adminData.projectGroups[groupIndex].items[Number(projectIndex)][field] =
      target.value;
  }
});

groupsEditor.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) {
    return;
  }

  const action = trigger.dataset.action;
  const groupIndex = Number(trigger.dataset.groupIndex);
  const projectIndex = Number(trigger.dataset.projectIndex);

  if (action === "add-project") {
    adminData.projectGroups[groupIndex].items.push(createEmptyProject());
  }

  if (action === "move-group-up") {
    moveItem(adminData.projectGroups, groupIndex, groupIndex - 1);
  }

  if (action === "move-group-down") {
    moveItem(adminData.projectGroups, groupIndex, groupIndex + 1);
  }

  if (action === "move-project-up") {
    moveItem(
      adminData.projectGroups[groupIndex].items,
      projectIndex,
      projectIndex - 1
    );
  }

  if (action === "move-project-down") {
    moveItem(
      adminData.projectGroups[groupIndex].items,
      projectIndex,
      projectIndex + 1
    );
  }

  if (action === "remove-project") {
    adminData.projectGroups[groupIndex].items.splice(projectIndex, 1);
    if (adminData.projectGroups[groupIndex].items.length === 0) {
      adminData.projectGroups[groupIndex].items.push(createEmptyProject());
    }
  }

  if (action === "remove-group") {
    adminData.projectGroups.splice(groupIndex, 1);
    if (adminData.projectGroups.length === 0) {
      adminData.projectGroups.push(createEmptyGroup());
    }
  }

  renderGroups();
});

groupsEditor.addEventListener("change", (event) => {
  const target = event.target;
  const action = target.dataset.action;

  if (!action) {
    return;
  }

  if (action === "move-group-to") {
    const groupIndex = Number(target.dataset.groupIndex);
    const nextIndex = normalizePosition(target.value, adminData.projectGroups.length);
    moveItem(adminData.projectGroups, groupIndex, nextIndex);
    renderGroups();
  }

  if (action === "move-project-to") {
    const groupIndex = Number(target.dataset.groupIndex);
    const projectIndex = Number(target.dataset.projectIndex);
    const projects = adminData.projectGroups[groupIndex].items;
    const nextIndex = normalizePosition(target.value, projects.length);
    moveItem(projects, projectIndex, nextIndex);
    renderGroups();
  }
});

addGroupButton.addEventListener("click", () => {
  adminData.projectGroups.push(createEmptyGroup());
  renderGroups();
});

exportButton.addEventListener("click", () => {
  syncTopFieldsToState();
  downloadJsonFile(
    "rio2c-site-data.json",
    JSON.stringify(normalizeSiteData(adminData), null, 2)
  );
  setSaveStatus("JSON exportado com sucesso.", "success");
});

resetButton.addEventListener("click", () => {
  adminData = resetSiteData();
  fillTopFields();
  renderGroups();
  setSaveStatus("Conteudo restaurado para o padrao inicial.", "success");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  try {
    syncTopFieldsToState();
    adminData = saveSiteData(adminData);
    renderGroups();
    setSaveStatus(
      "Alteracoes salvas. Reabra o site principal para ver a versao atualizada.",
      "success"
    );
  } catch (error) {
    console.error(error);
    setSaveStatus("Nao foi possivel salvar agora.", "error");
  }
});

fillTopFields();
renderGroups();
updateAuthView(isAuthenticated());

if (!isAuthenticated()) {
  passwordField.focus();
}
