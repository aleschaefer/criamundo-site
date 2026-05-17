let adminData = loadSiteData();

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

function setSaveStatus(message, type = "") {
  saveStatus.textContent = message;
  saveStatus.className = `save-status${type ? ` is-${type}` : ""}`;
}

function fillTopFields() {
  form.elements["contact.email"].value = adminData.siteConfig.contact.email || "";
  form.elements["contact.whatsapp"].value =
    adminData.siteConfig.contact.whatsapp || "";
  form.elements["contact.instagram"].value =
    adminData.siteConfig.contact.instagram || "";
  form.elements["challenge.endpoint"].value =
    adminData.siteConfig.challengeForm.endpoint || "";
  form.elements["challenge.fallbackSubject"].value =
    adminData.siteConfig.challengeForm.fallbackSubject || "";
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
              <p class="group-count">${group.items.length} projetos nesta seção</p>
            </div>
            <button class="button button-danger" type="button" data-action="remove-group" data-group-index="${groupIndex}">
              Remover categoria
            </button>
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
                        <button class="button button-danger" type="button" data-action="remove-project" data-group-index="${groupIndex}" data-project-index="${projectIndex}">
                          Remover projeto
                        </button>
                      </div>

                      <div class="project-body">
                        <div class="grid grid-2">
                          <label>
                            Título
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
                            Gênero
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
                            Público-alvo
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncTopFieldsToState() {
  adminData.siteConfig.contact.email = form.elements["contact.email"].value.trim();
  adminData.siteConfig.contact.whatsapp =
    form.elements["contact.whatsapp"].value.trim();
  adminData.siteConfig.contact.instagram =
    form.elements["contact.instagram"].value.trim();

  adminData.siteConfig.challengeForm.endpoint =
    form.elements["challenge.endpoint"].value.trim();
  adminData.siteConfig.challengeForm.fallbackSubject =
    form.elements["challenge.fallbackSubject"].value.trim();
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
  setSaveStatus("Conteúdo restaurado para o padrão inicial.", "success");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  try {
    syncTopFieldsToState();
    adminData = saveSiteData(adminData);
    renderGroups();
    setSaveStatus(
      "Alterações salvas. Reabra o site principal para ver a versão atualizada.",
      "success"
    );
  } catch (error) {
    console.error(error);
    setSaveStatus("Não foi possível salvar agora.", "error");
  }
});

fillTopFields();
renderGroups();
