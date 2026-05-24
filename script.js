const previewMode = new URLSearchParams(window.location.search).get("preview");
const siteData = previewMode === "local" ? loadSiteData() : loadPublishedSiteData();
const { siteConfig, featuredProject, projectGroups } = siteData;

const contactItems = [
  {
    label: "E-mail",
    value: formatContactDisplay("email", siteConfig.contact.email),
    href: `mailto:${siteConfig.contact.email}`
  },
  {
    label: "WhatsApp",
    value: formatContactDisplay("whatsapp", siteConfig.contact.whatsapp),
    href: buildWhatsappLink(siteConfig.contact.whatsapp)
  },
  {
    label: "Instagram",
    value: formatContactDisplay("instagram", siteConfig.contact.instagram),
    href: siteConfig.contact.instagram
  }
];

function formatContactDisplay(type, value) {
  const text = String(value || "").trim();
  if (!text) {
    return "Atualize no painel";
  }

  if (type === "instagram") {
    return text
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@")
      .replace(/\/+$/, "");
  }

  return text;
}

function buildWhatsappLink(
  number,
  message = "Ola, Alexandre. Gostaria de conversar sobre seus projetos."
) {
  const digits = String(number || "").replace(/\D/g, "");
  return digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : "#contato";
}

function buildProjectConversationLink(projectTitle) {
  const message = `Ola, Alexandre. Gostaria de conversar sobre o projeto "${projectTitle}".`;
  if (siteConfig.contact.whatsapp) {
    return buildWhatsappLink(siteConfig.contact.whatsapp, message);
  }

  return `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(
    `Conversa sobre o projeto ${projectTitle}`
  )}&body=${encodeURIComponent(message)}`;
}

function metaCard(label, value) {
  return `
    <div class="meta-card">
      <span class="meta-label">${label}</span>
      <span class="meta-value">${value}</span>
    </div>
  `;
}

function renderFeaturedProject() {
  const container = document.querySelector("#featured-project");
  container.innerHTML = `
    <div class="featured-topline">
      <p class="eyebrow">Projeto em destaque</p>
      <span class="badge">Rio2C Focus</span>
    </div>
    <div>
      <h3>${featuredProject.title}</h3>
      <p class="featured-logline">${featuredProject.logline}</p>
    </div>
    <div class="featured-grid">
      ${metaCard("Formato", featuredProject.format)}
      ${metaCard("Genero", featuredProject.genre)}
      ${metaCard("Status", featuredProject.status)}
      ${metaCard("Publico-alvo", featuredProject.audience)}
    </div>
    <div>
      <a
        class="button button-primary"
        href="${buildProjectConversationLink(featuredProject.title)}"
        target="_blank"
        rel="noreferrer"
      >
        Conversar sobre este projeto
      </a>
    </div>
  `;
}

function renderProjectGroups() {
  const container = document.querySelector("#project-groups");
  container.innerHTML = projectGroups
    .map(
      (group) => `
        <section class="project-group">
          <div class="category-title">
            <h3>${group.category}</h3>
            <span class="project-count">${group.items.length} projetos</span>
          </div>
          <div class="project-grid">
            ${group.items
              .map(
                (project) => `
                  <article class="project-card">
                    <div class="project-card-header">
                      <div class="project-card-title">
                        <p class="eyebrow project-format">${project.format}</p>
                        <h3>${project.title}</h3>
                      </div>
                    </div>
                    <div class="project-card-body">
                      <div class="project-meta-grid">
                        ${metaCard("Genero", project.genre)}
                        ${metaCard("Status", project.status)}
                        ${metaCard("Publico-alvo", project.audience)}
                      </div>
                      <p class="project-logline">${project.logline}</p>
                    </div>
                    <a
                      class="button button-secondary"
                      href="${buildProjectConversationLink(project.title)}"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Conversar sobre este projeto
                    </a>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function renderContacts() {
  const container = document.querySelector("#contact-grid");
  container.innerHTML = contactItems
    .map(
      (item) => `
        <a class="contact-card" href="${item.href}" target="_blank" rel="noreferrer">
          <span class="contact-label">${item.label}</span>
          <span class="contact-value">${item.value}</span>
        </a>
      `
    )
    .join("");
}

function setFormStatus(message, type = "") {
  const status = document.querySelector("#form-status");
  status.textContent = message;
  status.className = `form-status${type ? ` is-${type}` : ""}`;
}

function getSuccessMessage() {
  const configuredMessage = siteConfig.challengeForm.successMessage || "";
  return configuredMessage === "Desafio enviado com sucesso. Obrigado pelo contato."
    ? "Seu desafio criativo chegou ao CRIAMUNDO."
    : configuredMessage || "Sua provocacao criativa foi recebida.";
}

function getChallengePayload(formData) {
  return {
    name: formData.get("name").trim(),
    contact: formData.get("contact").trim(),
    keywords: formData.get("keywords").trim(),
    format: formData.get("format"),
    style: formData.get("style")
  };
}

function getFormIntegrationConfig(form, formData) {
  const htmlAccessKey = formData.get("access_key");
  const htmlAction = form.getAttribute("action");

  return {
    endpoint:
      siteConfig.challengeForm.endpoint ||
      htmlAction ||
      "https://api.web3forms.com/submit",
    accessKey:
      siteConfig.challengeForm.accessKey ||
      (typeof htmlAccessKey === "string" ? htmlAccessKey.trim() : "")
  };
}

async function submitToEndpoint(payload, integrationConfig) {
  const { endpoint, accessKey } = integrationConfig;

  const requestBody = {
    access_key: accessKey,
    subject:
      siteConfig.challengeForm.subject ||
      siteConfig.challengeForm.fallbackSubject ||
      "Novo desafio criativo recebido",
    from_name: siteConfig.challengeForm.fromName || "CRIAMUNDO",
    name: payload.name,
    contact: payload.contact || "Nao informado",
    keywords: payload.keywords,
    format: payload.format,
    style: payload.style || "Nao informado",
    message: [
      `Nome: ${payload.name}`,
      `Contato: ${payload.contact || "Nao informado"}`,
      `Formato desejado: ${payload.format}`,
      `Estilo: ${payload.style || "Nao informado"}`,
      `Palavras-chave: ${payload.keywords}`
    ].join("\n")
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const result = await response.json();

  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Falha no envio do formulario.");
  }
}

function openMailClient(payload) {
  const subject = siteConfig.challengeForm.fallbackSubject;
  const body = [
    `Nome: ${payload.name}`,
    `Contato: ${payload.contact || "Nao informado"}`,
    `Formato desejado: ${payload.format}`,
    `Estilo: ${payload.style || "Nao informado"}`,
    `Palavras-chave: ${payload.keywords}`
  ].join("\n");

  window.location.href = `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

function bindForm() {
  const form = document.querySelector("#challenge-form");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = getChallengePayload(formData);
    const integrationConfig = getFormIntegrationConfig(form, formData);

    if (!payload.name || !payload.keywords || !payload.format) {
      setFormStatus("Preencha todos os campos obrigatorios.", "error");
      return;
    }

    if (payload.keywords.length > 100) {
      setFormStatus("As palavras-chave devem ter ate 100 caracteres.", "error");
      return;
    }

    const keywordCount = payload.keywords.split(/[,\s]+/).filter(Boolean).length;
    if (keywordCount < 3) {
      setFormStatus("Envie pelo menos 3 palavras para o desafio.", "error");
      return;
    }

    try {
      if (integrationConfig.accessKey) {
        await submitToEndpoint(payload, integrationConfig);
      } else {
        openMailClient(payload);
      }

      form.reset();
      setFormStatus(getSuccessMessage(), "success");
    } catch (error) {
      setFormStatus(
        "Nao foi possivel enviar agora. Verifique a configuracao do endpoint ou do e-mail.",
        "error"
      );
      console.error(error);
    }
  });
}

function bindTopbarScroll() {
  const topbar = document.querySelector("#topbar");

  function updateTopbar() {
    if (window.scrollY > 18) {
      topbar.classList.add("is-scrolled");
    } else {
      topbar.classList.remove("is-scrolled");
    }
  }

  updateTopbar();
  window.addEventListener("scroll", updateTopbar, { passive: true });
}

function setupPreviewBanner() {
  if (previewMode !== "local") {
    return;
  }

  document.body.classList.add("is-preview");
  const banner = document.querySelector("#preview-banner");
  if (banner) {
    banner.hidden = false;
  }
}

setupPreviewBanner();
renderFeaturedProject();
renderProjectGroups();
renderContacts();
bindForm();
bindTopbarScroll();
